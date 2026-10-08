import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { POCError, TINY_AUTH, TINY_TOKEN } from './config.ts';
import type { POCConfig } from './config.ts';
import { requestJSON, TransportError } from './transport.ts';
import type { Fetcher } from './transport.ts';
export function equalSecret(a: string, b: string): boolean {
  // Compare fixed-length hashes: no input value is returned or logged.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
type Tokens = { access: string; refresh?: string; expiresAt: number; refreshExpiresAt: number };
export function parseTokens(value: unknown, now: number, previousRefresh?: string): Tokens {
  if (!value || typeof value !== 'object') throw new POCError('INVALID_TOKEN');
  const v = value as Record<string, unknown>;
  if (typeof v.access_token !== 'string' || !v.access_token || v.access_token.length > 32768 || /[\s\x00-\x1f]/.test(v.access_token) ||
      typeof v.token_type !== 'string' || v.token_type.toLowerCase() !== 'bearer' ||
      typeof v.expires_in !== 'number' || !Number.isFinite(v.expires_in) || v.expires_in <= 0 || v.expires_in > 86400 ||
      (v.refresh_token !== undefined && (typeof v.refresh_token !== 'string' || !v.refresh_token || v.refresh_token.length > 32768 || /[\s\x00-\x1f]/.test(v.refresh_token))) ||
      (v.refresh_expires_in !== undefined && (typeof v.refresh_expires_in !== 'number' || !Number.isFinite(v.refresh_expires_in) || v.refresh_expires_in <= 0 || v.refresh_expires_in > 86400))) throw new POCError('INVALID_TOKEN');
  return { access: v.access_token, refresh: v.refresh_token as string | undefined ?? previousRefresh,
    expiresAt: now + v.expires_in * 1000, refreshExpiresAt: now + Number(v.refresh_expires_in ?? 86400) * 1000 };
}
export class TinyOAuthSession {
  #tokens?: Tokens;
  #pending?: { state: string; cookie: string; verifier?: string; expiresAt: number };
  #refreshing?: Promise<string>;
  #generation = 0;
  #metrics: { grant: 'authorization_code' | 'refresh_token'; status: number; durationMs: number; outcome: string }[] = [];
  #createdAt: number;
  #config: POCConfig; #fetcher: Fetcher; #now: () => number;
  constructor(config: POCConfig, fetcher: Fetcher = fetch, now: () => number = Date.now) { this.#config = config; this.#fetcher = fetcher; this.#now = now; this.#createdAt = now(); }
  #checkLifetime() { if (this.#now() - this.#createdAt >= 30 * 60_000) { this.disconnect(); throw new POCError('SESSION_EXPIRED'); } }
  async #exchange(grant: 'authorization_code' | 'refresh_token', body: URLSearchParams) {
    const started = performance.now(); const metric = { grant, status: 0, durationMs: 0, outcome: 'NETWORK' };
    try {
      const result = await requestJSON(this.#fetcher, TINY_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }, 10_000, 65536);
      metric.status = result.status; metric.outcome = result.status === 200 ? 'RESPONSE_RECEIVED' : 'AUTH_FAILED'; return result;
    } catch (error) {
      metric.outcome = error instanceof POCError ? error.kind : 'NETWORK';
      if (error instanceof TransportError) metric.status = error.status;
      throw error;
    } finally { metric.durationMs = Math.round((performance.now() - started) * 100) / 100; this.#metrics.push(metric); }
  }
  start(): { url: string; cookie: string } {
    this.#checkLifetime(); this.disconnect();
    const state = randomBytes(32).toString('base64url'), cookie = randomBytes(32).toString('base64url');
    const verifier = this.#config.pkce === 'S256' ? randomBytes(32).toString('base64url') : undefined;
    this.#pending = { state, cookie, verifier, expiresAt: this.#now() + 5 * 60_000 };
    const url = new URL(TINY_AUTH);
    url.search = new URLSearchParams({ client_id: this.#config.clientId, redirect_uri: this.#config.redirectUri, scope: 'openid', response_type: 'code', state }).toString();
    if (verifier) { url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); url.searchParams.set('code_challenge_method', 'S256'); }
    return { url: url.href, cookie };
  }
  async callback(url: URL, cookie: string): Promise<void> {
    this.#checkLifetime(); const pending = this.#pending;
    if (url.origin + url.pathname !== this.#config.redirectUri || !pending || pending.expiresAt <= this.#now() ||
        url.searchParams.getAll('state').length !== 1 || !equalSecret(url.searchParams.get('state') ?? '', pending.state) ||
        !equalSecret(cookie, pending.cookie)) throw new POCError('INVALID_STATE');
    // Consume before awaiting: parallel callbacks cannot exchange the same code twice.
    this.#pending = undefined;
    if (url.searchParams.has('error')) throw new POCError('AUTH_DENIED');
    const code = url.searchParams.get('code');
    if (url.searchParams.getAll('code').length !== 1 || !code || code.length > 4096) throw new POCError('INVALID_CALLBACK');
    const generation = this.#generation;
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: this.#config.clientId, client_secret: this.#config.clientSecret, redirect_uri: this.#config.redirectUri, code });
    if (pending.verifier) body.set('code_verifier', pending.verifier);
    const result = await this.#exchange('authorization_code', body);
    if (generation !== this.#generation) throw new POCError('DISCONNECTED');
    if (result.status !== 200) throw new POCError('AUTH_FAILED', result.status);
    this.#tokens = parseTokens(result.data, this.#now());
  }
  async accessToken(): Promise<string> {
    this.#checkLifetime();
    if (this.#refreshing) return this.#refreshing;
    const tokens = this.#tokens; if (!tokens) throw new POCError('NOT_CONNECTED');
    if (tokens.expiresAt > this.#now() + 30_000) return tokens.access;
    if (!this.#config.allowRefresh || !tokens.refresh || tokens.refreshExpiresAt <= this.#now()) { this.disconnect(); throw new POCError('RECONNECT_REQUIRED'); }
    const generation = this.#generation;
    const refresh = async () => {
      try {
        const result = await this.#exchange('refresh_token', new URLSearchParams({ grant_type: 'refresh_token', client_id: this.#config.clientId, client_secret: this.#config.clientSecret, refresh_token: tokens.refresh! }));
        if (generation !== this.#generation) throw new POCError('DISCONNECTED');
        if (result.status !== 200) throw new POCError('RECONNECT_REQUIRED', result.status);
        const next = parseTokens(result.data, this.#now(), tokens.refresh);
        // Without rotation do not extend the previous refresh token's lifetime.
        if (next.refresh === tokens.refresh) next.refreshExpiresAt = Math.min(next.refreshExpiresAt, tokens.refreshExpiresAt);
        this.#tokens = next; return next.access;
      } catch (error) { if (generation === this.#generation) this.disconnect(); throw error; }
    };
    const promise = refresh(); this.#refreshing = promise;
    try { return await promise; } finally { if (this.#refreshing === promise) this.#refreshing = undefined; }
  }
  invalidateAccess(): void { this.disconnect(); }
  disconnect(): void { this.#generation++; this.#tokens = undefined; this.#pending = undefined; this.#refreshing = undefined; }
  connected(): boolean { return !!this.#tokens && this.#now() - this.#createdAt < 30 * 60_000; }
  report() { return structuredClone(this.#metrics); }
}
