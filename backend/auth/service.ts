import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.ts';
import { hash, secret, passwordHash, passwordMatches, equal } from '../security/crypto.ts';
import { fail } from '../security/errors.ts';
export type Role = 'ADMIN' | 'OPERADOR' | 'VENDEDOR';
export interface Principal { sessionId: string; userId: string; organizationId: string; role: Role; login: string }
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function loginName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9@._+-]{3,120}$/.test(value)) fail('INPUT_INVALID');
  return value.toLowerCase();
}
export function admin(p: Principal) { if (p.role !== 'ADMIN') fail('FORBIDDEN', 403); }
export class AuthService {
  readonly db: Database; private seconds: number; private dummy: Promise<string>; private hashing = 0;
  constructor(db: Database, seconds: number) { this.db = db; this.seconds = seconds; this.dummy = passwordHash(secret()); }
  async login(login: unknown, password: unknown, organization: unknown, ip: string, correlation = randomUUID()) {
    const name = loginName(login);
    if (typeof password !== 'string' || password.length > 256 || (organization !== undefined && !uuid(organization))) fail('INVALID_CREDENTIALS', 401);
    // Shared persistent buckets across backend instances. IP comes from socket, never client-supplied headers.
    for (const [key, limit] of [[hash('ip:' + ip), 30], [hash('login:' + name), 8]] as const) {
      const [bucket] = await this.db.client`INSERT INTO login_limits(key,count,expires_at) VALUES (${key},1,NOW()+interval '15 minutes')
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.expires_at<=NOW() THEN 1 ELSE login_limits.count+1 END,
        expires_at=CASE WHEN login_limits.expires_at<=NOW() THEN NOW()+interval '15 minutes' ELSE login_limits.expires_at END RETURNING count`;
      if (bucket.count > limit) fail('LOGIN_RATE_LIMIT', 429);
    }
    if (this.hashing >= 2) fail('LOGIN_BUSY', 429);
    this.hashing++;
    let valid: boolean; let user: { id: string; password_hash: string; status: string } | undefined;
    try {
      [user] = await this.db.client<{ id: string; password_hash: string; status: string }[]>`SELECT id,password_hash,status FROM users WHERE login=${name}`;
      valid = await passwordMatches(password, user?.password_hash ?? await this.dummy);
    } finally { this.hashing--; }
    if (!valid || !user || user.status !== 'ACTIVE') fail('INVALID_CREDENTIALS', 401);
    const uid = user.id, token = secret(), csrf = hash('csrf:' + token);
    const result = await this.db.client.begin(async sql => {
      const rows = await sql<{ organization_id: string; role: Role }[]>`SELECT m.organization_id,m.role FROM organization_memberships m
        JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id
        WHERE m.user_id=${uid} AND m.status='ACTIVE' AND u.status='ACTIVE' AND o.status='ACTIVE'
        AND (${organization ?? null}::uuid IS NULL OR m.organization_id=${organization ?? null}::uuid) FOR SHARE OF m,u,o`;
      if (rows.length !== 1) fail('INVALID_CREDENTIALS', 401);
      const org = rows[0].organization_id;
      const [session] = await sql`INSERT INTO sessions(user_id,organization_id,session_token_hash,csrf_hash,expires_at)
        VALUES (${uid},${org},${hash(token)},${hash(csrf)},NOW()+${this.seconds}*interval '1 second') RETURNING id`;
      await sql`UPDATE users SET last_login_at=NOW() WHERE id=${uid}`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${org},${uid},'LOGIN','OK',${correlation})`;
      return { sessionId: session.id as string, userId: uid, organizationId: org, role: rows[0].role, login: name };
    });
    return { token, csrf, principal: result };
  }
  async authenticate(token: string): Promise<Principal> {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) fail('UNAUTHENTICATED', 401);
    const [row] = await this.db.client<{ id: string; user_id: string; organization_id: string; role: Role; login: string }[]>`SELECT s.id,s.user_id,s.organization_id,m.role,u.login FROM sessions s
      JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id
      JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id
      WHERE s.session_token_hash=${hash(token)} AND s.revoked_at IS NULL AND s.expires_at>NOW()
      AND u.status='ACTIVE' AND o.status='ACTIVE' AND m.status='ACTIVE'`;
    if (!row) fail('UNAUTHENTICATED', 401);
    return { sessionId: row.id, userId: row.user_id, organizationId: row.organization_id, role: row.role, login: row.login };
  }
  async checkCSRF(p: Principal, value: string) {
    const [row] = await this.db.client`SELECT csrf_hash FROM sessions WHERE id=${p.sessionId} AND organization_id=${p.organizationId} AND revoked_at IS NULL AND expires_at>NOW()`;
    if (!row || !equal(hash(value), row.csrf_hash)) fail('CSRF_DENIED', 403);
  }
  async logout(p: Principal, correlation = randomUUID()) {
    await this.db.client.begin(async sql => {
      await sql`UPDATE sessions SET revoked_at=NOW() WHERE id=${p.sessionId} AND organization_id=${p.organizationId}`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'LOGOUT','OK',${correlation})`;
    });
  }
  async bootstrap(name: string, login: unknown, password: string) {
    const normalized = loginName(login), stored = await passwordHash(password);
    if (!name.trim() || name.length > 120) fail('INPUT_INVALID');
    return this.db.client.begin(async sql => {
      await sql`SELECT pg_advisory_xact_lock(72820262)`;
      if ((await sql`SELECT id FROM organizations LIMIT 1`).length) fail('BOOTSTRAP_ALREADY_DONE', 409);
      const [org] = await sql`INSERT INTO organizations(name) VALUES (${name.trim()}) RETURNING id`;
      const [user] = await sql`INSERT INTO users(login,password_hash) VALUES (${normalized},${stored}) RETURNING id`;
      await sql`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${org.id},${user.id},'ADMIN')`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${org.id},${user.id},'BOOTSTRAP','OK',${randomUUID()})`;
      return { organizationId: org.id as string, userId: user.id as string };
    });
  }
  async createUser(p: Principal, login: unknown, password: string, role: unknown, correlation = randomUUID()) {
    admin(p); const normalized = loginName(login);
    if (!['ADMIN', 'OPERADOR', 'VENDEDOR'].includes(String(role))) fail('INPUT_INVALID');
    const stored = await passwordHash(password);
    return this.db.client.begin(async sql => {
      const [user] = await sql`INSERT INTO users(login,password_hash) VALUES (${normalized},${stored}) ON CONFLICT(login) DO NOTHING RETURNING id`;
      if (!user) fail('USER_UNAVAILABLE', 409);
      await sql`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${p.organizationId},${user.id},${String(role)})`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'USER_CREATE','OK',${correlation})`;
      return { id: user.id as string, login: normalized, role };
    });
  }
  async manageUser(p: Principal, id: string, operation: 'deactivate' | 'reset', password?: string, correlation = randomUUID()) {
    admin(p); if (!uuid(id) || id === p.userId) fail('USER_UNAVAILABLE', 403);
    const stored = operation === 'reset' ? await passwordHash(password ?? '') : undefined;
    await this.db.client.begin(async sql => {
      const [u] = await sql`SELECT u.id FROM users u JOIN organization_memberships m ON m.user_id=u.id
        WHERE u.id=${id} AND m.organization_id=${p.organizationId} FOR UPDATE OF u,m`;
      if (!u) fail('USER_UNAVAILABLE', 404);
      // Global identity/password cannot be changed by a tenant admin if shared with another tenant.
      if ((await sql`SELECT organization_id FROM organization_memberships WHERE user_id=${id} AND organization_id<>${p.organizationId}`).length) fail('USER_SHARED', 403);
      if (stored) await sql`UPDATE users SET password_hash=${stored},updated_at=NOW() WHERE id=${id}`;
      else await sql`UPDATE users SET status='INACTIVE',updated_at=NOW() WHERE id=${id}`;
      await sql`UPDATE sessions SET revoked_at=NOW() WHERE user_id=${id}`;
      await sql`UPDATE oauth_attempts SET consumed_at=NOW() WHERE initiated_by_user_id=${id} AND consumed_at IS NULL`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},${operation === 'reset' ? 'USER_RESET' : 'USER_DEACTIVATE'},'OK',${correlation})`;
    });
  }
  async listUsers(p: Principal) {
    admin(p); return this.db.client`SELECT u.id,u.login,u.status,m.role FROM users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.organization_id=${p.organizationId} ORDER BY u.login LIMIT 100`;
  }
}
