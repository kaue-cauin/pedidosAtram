import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../../db/client.ts';
import type { Config } from '../../config/env.ts';
import { admin, type Principal } from '../../auth/service.ts';
import { Vault, hash, secret, equal } from '../../security/crypto.ts';
import { BackendError, fail } from '../../security/errors.ts';
import { TINY_API, TINY_AUTH, TINY_TOKEN, POCError } from '../../../integrations/tiny-poc/config.ts';
import { parseTokens } from '../../../integrations/tiny-poc/oauth.ts';
import { object, observe } from '../../../integrations/tiny-poc/contracts.ts';
import { requestJSON, type Fetcher } from '../../../integrations/tiny-poc/transport.ts';
import { AccountBudget } from '../../catalog/budget.ts';
import { losslessJSON } from '../../catalog/pagination.ts';
import type { Resource } from '../../catalog/model.ts';
export type ReadResource = 'info' | 'products' | 'contacts' | 'sellers' | 'priceLists';
export interface TinyReadGateway { read(p: Principal, resource: ReadResource, correlation?: string): Promise<unknown> }
const paths = { info: '/info', products: '/produtos', contacts: '/contatos', sellers: '/vendedores', priceLists: '/listas-precos' } as const;
interface Connection {
  id: string; organization_id: string; status: string; account_verified: boolean; expected_identity_encrypted: string | null;
  access_token_encrypted: string | null; refresh_token_encrypted: string | null; access_expires_at: Date | null; refresh_expires_at: Date | null;
  verified_account_identity: string|null; token_version: number; refresh_lease: string | null; refresh_lease_until: Date | null; pause_until: Date | null;
}
function safeError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  return new BackendError(error instanceof POCError ? error.kind : 'ERP_UNAVAILABLE', 503);
}
export class TinyService implements TinyReadGateway {
  private db: Database; private config: Config; private vault: Vault; private fetcher: Fetcher; private timeout: number; private budget?:AccountBudget;
  constructor(db: Database, config: Config, fetcher: Fetcher = fetch, timeout = 10000, budget?:AccountBudget) { this.budget=budget; this.db = db; this.config = config; this.vault = new Vault(config.keys, config.activeKey); this.fetcher = fetcher; this.timeout = timeout; }
  private async connection(org: string): Promise<Connection> {
    const [row] = await this.db.client<Connection[]>`SELECT * FROM erp_connections WHERE organization_id=${org} AND provider='TINY'`;
    if (!row) fail('NOT_CONFIGURED', 503); return row;
  }
  async status(p: Principal) {
    admin(p);
    const [row] = await this.db.client<Connection[]>`SELECT * FROM erp_connections WHERE organization_id=${p.organizationId} AND provider='TINY'`;
    const credentialUsable = !!row?.access_token_encrypted && ((row.access_expires_at?.getTime() ?? 0) > Date.now() || (this.config.tiny.refresh && !!row.refresh_token_encrypted && (row.refresh_expires_at?.getTime() ?? 0) > Date.now()));
    return { status: row?.status ?? 'NOT_CONFIGURED', oauthConnected: !!row?.access_token_encrypted, accountVerified: row?.account_verified ?? false,
      operationalReady: row?.status === 'CONNECTED' && row.account_verified && credentialUsable && this.config.tiny.enabled && this.config.tiny.reads,
      oauthEnabled: this.config.tiny.enabled, readEnabled: this.config.tiny.reads, refreshEnabled: this.config.tiny.refresh,
      tokenVersion: row?.token_version ?? 0, refreshBusy: !!row?.refresh_lease };
  }
  async configure(p: Principal, document: string, correlation = randomUUID()) {
    admin(p); const normalized = document.replace(/[.\-/ ]/g, ''); if (!/^\d{11}$|^\d{14}$/.test(normalized)) fail('INPUT_INVALID');
    await this.db.client.begin(async sql => {
      await sql`INSERT INTO erp_connections(organization_id,expected_identity_encrypted,encryption_key_version)
        VALUES (${p.organizationId},${this.vault.seal(normalized, p.organizationId, 'document')},${this.vault.active}) ON CONFLICT(organization_id,provider)
        DO UPDATE SET expected_identity_encrypted=EXCLUDED.expected_identity_encrypted,status='DISCONNECTED',account_verified=false,verified_account_identity=NULL,
        access_token_encrypted=NULL,refresh_token_encrypted=NULL,access_expires_at=NULL,refresh_expires_at=NULL,refresh_lease=NULL,refresh_lease_until=NULL,
        read_lease=NULL,read_lease_until=NULL,token_version=erp_connections.token_version+1,encryption_key_version=EXCLUDED.encryption_key_version,updated_at=NOW()`;
      await sql`UPDATE oauth_attempts SET consumed_at=NOW(),code_verifier_encrypted='' WHERE organization_id=${p.organizationId} AND consumed_at IS NULL`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'ERP_CONFIGURE','OK',${correlation})`;
    });
  }
  async start(p: Principal, correlation = randomUUID()): Promise<string> {
    admin(p); if (!this.config.tiny.enabled) fail('REAL_OAUTH_DISABLED', 403);
    const state = secret(), verifier = secret();
    await this.db.client.begin(async sql => {
      const [row] = await sql<Connection[]>`SELECT * FROM erp_connections WHERE organization_id=${p.organizationId} AND provider='TINY' FOR UPDATE`;
      if (!row?.expected_identity_encrypted) fail('ACCOUNT_CONFIG_REQUIRED', 409);
      this.vault.open(row.expected_identity_encrypted, p.organizationId, 'document');
      await sql`UPDATE oauth_attempts SET consumed_at=NOW(),code_verifier_encrypted='' WHERE organization_id=${p.organizationId} AND consumed_at IS NULL`;
      await sql`UPDATE erp_connections SET status='CONNECTING',account_verified=false,verified_account_identity=NULL,
        access_token_encrypted=NULL,refresh_token_encrypted=NULL,access_expires_at=NULL,refresh_expires_at=NULL,refresh_lease=NULL,refresh_lease_until=NULL,
        read_lease=NULL,read_lease_until=NULL,token_version=token_version+1,updated_at=NOW() WHERE id=${row.id}`;
      await sql`INSERT INTO oauth_attempts(organization_id,initiated_by_user_id,session_id,state_hash,code_verifier_encrypted,connection_version,expires_at)
        VALUES (${p.organizationId},${p.userId},${p.sessionId},${hash(state)},${this.vault.seal(verifier, p.organizationId, 'verifier')},${row.token_version + 1},NOW()+interval '5 minutes')`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'OAUTH_START','OK',${correlation})`;
    });
    const url = new URL(TINY_AUTH);
    url.search = new URLSearchParams({ client_id: this.config.tiny.clientId, redirect_uri: this.config.tiny.callback, response_type: 'code', scope: 'openid', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return url.href;
  }
  private async exchange(grant: string, values: Record<string, string>) {
    const result = await requestJSON(this.fetcher, TINY_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: grant, client_id: this.config.tiny.clientId, client_secret: this.config.tiny.clientSecret, ...values }) }, this.timeout, 65536);
    if (result.status !== 200) fail('TOKEN_EXCHANGE_FAILED', 503); return result.data;
  }
  async callback(p: Principal, url: URL, correlation = randomUUID()) {
    admin(p); if (!this.config.tiny.enabled) fail('REAL_OAUTH_DISABLED', 403);
    if (url.origin + url.pathname !== this.config.tiny.callback || url.searchParams.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state') ?? '')) fail('INVALID_CALLBACK');
    const pending = await this.db.client.begin(async sql => {
      const [row] = await sql<{ id: string; code_verifier_encrypted: string; connection_version: number }[]>`SELECT a.id,a.code_verifier_encrypted,a.connection_version FROM oauth_attempts a
        JOIN sessions s ON s.id=a.session_id JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
        JOIN organizations o ON o.id=s.organization_id
        WHERE a.state_hash=${hash(url.searchParams.get('state')!)} AND a.organization_id=${p.organizationId} AND a.initiated_by_user_id=${p.userId} AND a.session_id=${p.sessionId}
        AND a.consumed_at IS NULL AND a.expires_at>NOW() AND s.expires_at>NOW() AND s.revoked_at IS NULL AND u.status='ACTIVE' AND o.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN'
        FOR UPDATE OF a`;
      if (!row) fail('INVALID_STATE');
      await sql`UPDATE oauth_attempts SET consumed_at=NOW(),code_verifier_encrypted='' WHERE id=${row.id}`; return row;
    });
    try {
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error')) fail('AUTH_DENIED');
      if (url.searchParams.getAll('code').length !== 1 || !code || code.length > 4096 || /[\x00-\x1f]/.test(code)) fail('INVALID_CALLBACK');
      const data = await this.exchange('authorization_code', { redirect_uri: this.config.tiny.callback, code, code_verifier: this.vault.open(pending.code_verifier_encrypted, p.organizationId, 'verifier') });
      const tokens = parseTokens(data, Date.now()), raw = data as Record<string, unknown>;
      const refreshExpiry = raw.refresh_expires_in !== undefined && tokens.refresh ? new Date(tokens.refreshExpiresAt) : null;
      const changed = await this.db.client.begin(async sql => {
        const rows = await sql`UPDATE erp_connections SET access_token_encrypted=${this.vault.seal(tokens.access, p.organizationId, 'access')},
          refresh_token_encrypted=${tokens.refresh ? this.vault.seal(tokens.refresh, p.organizationId, 'refresh') : null},access_expires_at=${new Date(tokens.expiresAt)},refresh_expires_at=${refreshExpiry},
          encryption_key_version=${this.vault.active},connected_at=NOW(),disconnected_at=NULL,updated_at=NOW()
          WHERE organization_id=${p.organizationId} AND token_version=${pending.connection_version} AND status='CONNECTING'
          AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id
            WHERE s.id=${p.sessionId} AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN') RETURNING id`;
        if (!rows.length) fail('OPERATION_STALE', 409);
        await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'OAUTH_CALLBACK','TOKEN_STORED_UNVERIFIED',${correlation})`;
        return rows.length;
      });
      if (!changed) fail('OPERATION_STALE', 409);
    } catch (error) {
      await this.db.client`UPDATE erp_connections SET status='ERROR',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,token_version=token_version+1,updated_at=NOW()
        WHERE organization_id=${p.organizationId} AND token_version=${pending.connection_version} AND status='CONNECTING'`;
      throw safeError(error);
    }
    // No /info side effect: an explicit authorized verify-account action is required.
  }
  async disconnect(p: Principal, correlation = randomUUID()) {
    admin(p);
    await this.db.client.begin(async sql => {
      await sql`UPDATE erp_connections SET status='DISCONNECTED',account_verified=false,verified_account_identity=NULL,access_token_encrypted=NULL,refresh_token_encrypted=NULL,
        access_expires_at=NULL,refresh_expires_at=NULL,refresh_lease=NULL,refresh_lease_until=NULL,read_lease=NULL,read_lease_until=NULL,token_version=token_version+1,disconnected_at=NOW(),updated_at=NOW()
        WHERE organization_id=${p.organizationId}`;
      await sql`UPDATE oauth_attempts SET consumed_at=NOW(),code_verifier_encrypted='' WHERE organization_id=${p.organizationId} AND consumed_at IS NULL`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'ERP_DISCONNECT','LOCAL_ONLY',${correlation})`;
    });
  }
  private async access(org: string): Promise<{ token: string; version: number }> {
    const lease = randomUUID();
    const claim = await this.db.client.begin(async sql => {
      const [row] = await sql<Connection[]>`SELECT * FROM erp_connections WHERE organization_id=${org} AND provider='TINY' FOR UPDATE`;
      if (!row?.access_token_encrypted || !['CONNECTED', 'CONNECTING'].includes(row.status)) fail('REAUTH_REQUIRED', 409);
      if (row.refresh_lease) {
        if (row.refresh_lease_until && row.refresh_lease_until.getTime() > Date.now()) fail('REFRESH_BUSY', 409);
        // An abandoned refresh may already have rotated remotely. Never take over/retry that credential.
        await sql`UPDATE erp_connections SET status='REAUTH_REQUIRED',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,
          refresh_lease=NULL,refresh_lease_until=NULL,token_version=token_version+1 WHERE id=${row.id}`;
        return { unavailable: true as const };
      }
      if (row.access_expires_at && row.access_expires_at.getTime() > Date.now() + 30000) return { token: this.vault.open(row.access_token_encrypted, org, 'access'), version: row.token_version };
      if (!this.config.tiny.refresh || !row.refresh_token_encrypted || !row.refresh_expires_at || row.refresh_expires_at.getTime() <= Date.now()) {
        await sql`UPDATE erp_connections SET status='REAUTH_REQUIRED',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,token_version=token_version+1 WHERE id=${row.id}`;
        return { unavailable: true as const };
      }
      await sql`UPDATE erp_connections SET refresh_lease=${lease},refresh_lease_until=NOW()+interval '30 seconds' WHERE id=${row.id}`;
      return { row };
    });
    if ('unavailable' in claim) fail('REAUTH_REQUIRED', 409);
    if ('token' in claim) return { token: claim.token!, version: claim.version! };
    const row = claim.row!;
    try {
      const oldRefresh = this.vault.open(row.refresh_token_encrypted!, org, 'refresh');
      const data = await this.exchange('refresh_token', { refresh_token: oldRefresh }), raw = data as Record<string, unknown>;
      const next = parseTokens(data, Date.now(), oldRefresh);
      let refreshExpiry: Date | null = raw.refresh_expires_in !== undefined ? new Date(next.refreshExpiresAt) : null;
      if (next.refresh === oldRefresh) refreshExpiry = refreshExpiry ? new Date(Math.min(refreshExpiry.getTime(), row.refresh_expires_at!.getTime())) : row.refresh_expires_at;
      const updated = await this.db.client`UPDATE erp_connections SET access_token_encrypted=${this.vault.seal(next.access, org, 'access')},
        refresh_token_encrypted=${next.refresh ? this.vault.seal(next.refresh, org, 'refresh') : null},access_expires_at=${new Date(next.expiresAt)},refresh_expires_at=${refreshExpiry},
        token_version=token_version+1,encryption_key_version=${this.vault.active},refresh_lease=NULL,refresh_lease_until=NULL,updated_at=NOW()
        WHERE organization_id=${org} AND token_version=${row.token_version} AND refresh_lease=${lease} AND refresh_lease_until>NOW() AND status IN ('CONNECTED','CONNECTING') RETURNING token_version`;
      if (!updated.length) fail('OPERATION_STALE', 409); return { token: next.access, version: updated[0].token_version as number };
    } catch (error) {
      await this.db.client`UPDATE erp_connections SET status='REAUTH_REQUIRED',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,
        refresh_lease=NULL,refresh_lease_until=NULL,token_version=token_version+1,updated_at=NOW() WHERE organization_id=${org} AND token_version=${row.token_version} AND refresh_lease=${lease}`;
      throw safeError(error);
    }
  }
  async syncBinding(p:Principal){
    admin(p);if(!this.config.sync?.real||!this.config.tiny.enabled||!this.config.tiny.reads)fail('REAL_SYNC_DISABLED',403);
    const row=await this.connection(p.organizationId);if(row.status!=='CONNECTED'||!row.account_verified||!row.verified_account_identity)fail('ACCOUNT_NOT_VERIFIED',409);
    return {version:row.token_version,accountKey:row.verified_account_identity};
  }
  async readPage(p:Principal,resource:Resource,offset:number,limit:number,version:number){
    if(!Object.hasOwn(paths,resource)||!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isInteger(limit)||limit<1||limit>50)fail('INPUT_INVALID');
    return this.catalogRequest(p,resource,'?'+new URLSearchParams({limit:String(limit),offset:String(offset)}),version);
  }
  async readDetail(p:Principal,resource:'products'|'priceLists',id:string,version:number){
    if(!this.config.sync?.detail)fail('DETAIL_DISABLED',403);
    if(!['products','priceLists'].includes(resource)||!/^\d{1,30}$/.test(id)||!/[1-9]/.test(id))fail('INPUT_INVALID');
    return this.catalogRequest(p,resource,'/'+id,version);
  }
  private async catalogRequest(p:Principal,resource:Resource,suffix:string,version:number){
    const binding=await this.syncBinding(p);
    if(binding.version!==version)fail('CONNECTION_CHANGED',409);
    const access=await this.access(p.organizationId);if(access.version!==version)fail('CONNECTION_CHANGED',409);
    const lease=randomUUID();
    const claimed=await this.db.client`UPDATE erp_connections SET read_lease=${lease},read_lease_until=NOW()+interval '30 seconds' WHERE organization_id=${p.organizationId} AND token_version=${version} AND status='CONNECTED' AND account_verified=true AND (read_lease IS NULL OR read_lease_until<=NOW()) AND (pause_until IS NULL OR pause_until<=NOW()) RETURNING id`;
    if(!claimed.length)fail('READ_BUSY',409);
    try {
      const url=new URL(TINY_API+paths[resource]+suffix);
      const result=await requestJSON(this.fetcher,url.href,{method:'GET',headers:{Authorization:'Bearer '+access.token,Accept:'application/json'}},this.timeout,1048576,losslessJSON);
      const current=await this.db.client`SELECT id FROM erp_connections WHERE organization_id=${p.organizationId} AND token_version=${version} AND read_lease=${lease} AND status='CONNECTED' AND account_verified=true`;
      if(!current.length)fail('CONNECTION_CHANGED',409);
      if(result.status===401)await this.db.client`UPDATE erp_connections SET status='REAUTH_REQUIRED',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,token_version=token_version+1 WHERE organization_id=${p.organizationId} AND token_version=${version}`;
      return result;
    }finally{await this.db.client`UPDATE erp_connections SET read_lease=NULL,read_lease_until=NULL WHERE organization_id=${p.organizationId} AND read_lease=${lease}`;}
  }
  async verify(p: Principal, correlation = randomUUID()) { return this.read(p, 'info', correlation); }
  async read(p: Principal, resource: ReadResource, correlation = randomUUID()) {
    admin(p); if (!this.config.tiny.enabled || !this.config.tiny.reads) fail('REAL_READ_DISABLED', 403);
    if (!Object.hasOwn(paths, resource)) fail('RESOURCE_DENIED', 403);
    let row = await this.connection(p.organizationId);
    if (resource !== 'info' && !row.account_verified) fail('ACCOUNT_NOT_VERIFIED', 409);
    if (row.pause_until && row.pause_until.getTime() > Date.now()) fail('RATE_PAUSED', 429);
    const access = await this.access(p.organizationId); const lease = randomUUID();
    const claimed = await this.db.client`UPDATE erp_connections SET read_lease=${lease},read_lease_until=NOW()+interval '30 seconds'
      WHERE organization_id=${p.organizationId} AND token_version=${access.version} AND (read_lease IS NULL OR read_lease_until<=NOW())
      AND (pause_until IS NULL OR pause_until<=NOW()) AND status IN ('CONNECTED','CONNECTING') RETURNING *`;
    if (!claimed.length) fail('READ_BUSY', 409); row = claimed[0] as Connection;
    const accountKey=row.verified_account_identity??hash(this.vault.open(row.expected_identity_encrypted!,p.organizationId,'document'));
    let budgetLease:string|undefined;
    try {
      budgetLease=await this.budget?.claim(accountKey,resource==='info');
      const url = new URL(TINY_API + paths[resource]); if (resource !== 'info') url.search = 'limit=10&offset=0';
      const result = await requestJSON(this.fetcher, url.href, { method: 'GET', headers: { Authorization: 'Bearer ' + access.token, Accept: 'application/json' } }, this.timeout);
      if(budgetLease){await this.budget!.release(accountKey,budgetLease,result.quota,result.status);budgetLease=undefined;}
      const observation = result.status === 200 ? observe(resource, result.data) : undefined;
      if (resource === 'info' && result.status === 200 && (!observation?.fields.every(f => f.present === 1 && f.missing === 0) || !object(result.data) || typeof result.data.cpfCnpj !== 'string')) fail('CONTRACT_CONFLICT', 503);
      const infoValid = resource === 'info' && result.status === 200 && observation?.compatible && object(result.data) && typeof result.data.cpfCnpj === 'string' &&
        row.expected_identity_encrypted && equal(result.data.cpfCnpj.replace(/[.\-/ ]/g, ''), this.vault.open(row.expected_identity_encrypted, p.organizationId, 'document'));
      const code = result.status === 401 ? 'AUTH_FAILED' : result.status === 403 ? 'PERMISSION_DENIED' : result.status === 429 ? 'RATE_LIMIT' : result.status !== 200 ? 'HTTP_ERROR' : !observation?.compatible ? 'CONTRACT_CONFLICT' : resource === 'info' && !infoValid ? 'ACCOUNT_MISMATCH' : 'OK';
      await this.db.client.begin(async sql => {
        const [current] = await sql`SELECT id FROM erp_connections WHERE organization_id=${p.organizationId} AND token_version=${access.version} AND read_lease=${lease} FOR UPDATE`;
        if (!current) fail('OPERATION_STALE', 409);
        if (result.status === 429 || result.quota.remaining === 0) await sql`UPDATE erp_connections SET pause_until=NOW()+${Math.min(3600, Math.max(1, result.quota.retryAfterSeconds ?? result.quota.resetSeconds ?? 60))}*interval '1 second' WHERE id=${current.id}`;
        if (result.status === 401) await sql`UPDATE erp_connections SET status='REAUTH_REQUIRED',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,token_version=token_version+1 WHERE id=${current.id}`;
        else if (resource === 'info') {
          if (code === 'OK') await sql`UPDATE erp_connections SET status='CONNECTED',account_verified=true,verified_account_identity=${hash(this.vault.open(row.expected_identity_encrypted!, p.organizationId, 'document'))} WHERE id=${current.id}`;
          else if (code === 'ACCOUNT_MISMATCH') await sql`UPDATE erp_connections SET status='ACCOUNT_MISMATCH',account_verified=false,access_token_encrypted=NULL,refresh_token_encrypted=NULL,token_version=token_version+1 WHERE id=${current.id}`;
          else await sql`UPDATE erp_connections SET status='CONNECTING',account_verified=false,verified_account_identity=NULL WHERE id=${current.id}`;
        }
        await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},${'READ_' + resource.toUpperCase()},${code},${correlation})`;
      });
      if (code !== 'OK') fail(code, result.status === 403 ? 403 : result.status === 429 ? 429 : 503);
      return { resource, http: result.status, outcome: code, observation, quota: result.quota };
    } catch (error) {
      // Failed /info must not leave an older verification usable. Preserve valid OAuth for permission/server failures.
      if (resource === 'info') await this.db.client`UPDATE erp_connections SET status=CASE WHEN status='CONNECTED' THEN 'CONNECTING' ELSE status END,account_verified=false,verified_account_identity=NULL
        WHERE organization_id=${p.organizationId} AND token_version=${access.version} AND read_lease=${lease}`;
      throw safeError(error);
    } finally { if(budgetLease)await this.budget!.release(accountKey,budgetLease); await this.db.client`UPDATE erp_connections SET read_lease=NULL,read_lease_until=NULL,updated_at=NOW() WHERE organization_id=${p.organizationId} AND read_lease=${lease}`; }
  }
}
