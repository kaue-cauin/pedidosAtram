import { POCError, TINY_API } from './config.ts';
import type { POCConfig, Resource } from './config.ts';
import { equalSecret, TinyOAuthSession } from './oauth.ts';
import { object, observe } from './contracts.ts';
import type { Observation } from './contracts.ts';
import { requestJSON, TransportError } from './transport.ts';
import type { Fetcher, Quota } from './transport.ts';
const paths: Record<Resource, string> = { info: '/info', products: '/produtos', contacts: '/contatos', sellers: '/vendedores',
  priceLists: '/listas-precos', productDetail: '/produtos/', priceListDetail: '/listas-precos/' };
export interface ReadMetric { resource: Resource; method: 'GET'; status: number; durationMs: number; outcome: string; quota: Quota; observation?: Observation }
export class TinyReadClient {
  #used = 0; #busy = false; #verified = false; #generation = 0; #pauseUntil = 0;
  #metrics: ReadMetric[] = [];
  #config: POCConfig; #oauth: TinyOAuthSession; #fetcher: Fetcher; #now: () => number; #timeoutMs: number;
  constructor(config: POCConfig, oauth: TinyOAuthSession, fetcher: Fetcher = fetch, now: () => number = Date.now, timeoutMs = 10_000) {
    this.#config = config; this.#oauth = oauth; this.#fetcher = fetcher; this.#now = now; this.#timeoutMs = timeoutMs;
  }
  async read(resource: Resource): Promise<ReadMetric> {
    if (!Object.hasOwn(paths, resource) || !this.#config.resources.includes(resource)) throw new POCError('RESOURCE_DENIED');
    if (this.#busy) throw new POCError('READ_BUSY');
    if (this.#used >= 8) throw new POCError('BUDGET_EXHAUSTED');
    if (this.#pauseUntil > this.#now()) throw new POCError('RATE_PAUSED');
    if (resource !== 'info' && !this.#verified) throw new POCError('ACCOUNT_NOT_VERIFIED');
    this.#busy = true;
    const generation = this.#generation;
    const metric: ReadMetric = { resource, method: 'GET', status: 0, durationMs: 0, outcome: 'NETWORK', quota: {} };
    const start = performance.now(); let dispatched = false;
    try {
      const token = await this.#oauth.accessToken();
      if (generation !== this.#generation) throw new POCError('DISCONNECTED');
      let path = paths[resource];
      if (resource === 'productDetail' || resource === 'priceListDetail') {
        const id = resource === 'productDetail' ? this.#config.productId : this.#config.priceListId;
        if (!id || !Number.isSafeInteger(id) || id < 1) throw new POCError('RESOURCE_DENIED'); path += id;
      }
      const url = new URL(TINY_API + path);
      if (['products', 'contacts', 'sellers', 'priceLists'].includes(resource)) url.search = 'limit=10&offset=0';
      this.#used++; dispatched = true;
      const result = await requestJSON(this.#fetcher, url.href, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }, this.#timeoutMs);
      if (generation !== this.#generation) throw new POCError('DISCONNECTED');
      metric.status = result.status; metric.quota = result.quota;
      if (result.status === 429 || result.quota.remaining === 0) this.#pauseUntil = this.#now() + Math.min(3600, Math.max(1, result.quota.retryAfterSeconds ?? result.quota.resetSeconds ?? 60)) * 1000;
      if (result.status === 401) { this.#verified = false; this.#oauth.invalidateAccess(); }
      if (result.status !== 200) throw new POCError(result.status === 401 ? 'AUTH_FAILED' : result.status === 403 ? 'PERMISSION_DENIED' : result.status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR', result.status);
      if (resource === 'info') {
        this.#verified = false;
        if (!object(result.data) || typeof result.data.cpfCnpj !== 'string' || !equalSecret(result.data.cpfCnpj.replace(/[.\-/ ]/g, ''), this.#config.accountDocument)) throw new POCError('ACCOUNT_MISMATCH');
      }
      metric.observation = observe(resource, result.data);
      if (resource === 'info') this.#verified = metric.observation.compatible;
      metric.outcome = metric.observation.compatible ? 'OK' : 'CONTRACT_CONFLICT';
    } catch (error) {
      metric.outcome = error instanceof POCError ? error.kind : 'NETWORK';
      if (error instanceof TransportError) { metric.status = error.status; metric.quota = error.quota; }
      if (!this.#oauth.connected()) this.#verified = false;
      if (resource === 'info') this.#verified = false;
      if (!dispatched) throw new POCError(metric.outcome);
    } finally {
      metric.durationMs = Math.round((performance.now() - start) * 100) / 100;
      if (dispatched) this.#metrics.push(metric);
      this.#busy = false;
    }
    return structuredClone(metric);
  }
  disconnect(): void { this.#generation++; this.#verified = false; this.#oauth.disconnect(); }
  status() { return { connected: this.#oauth.connected(), accountVerified: this.#verified, usedGETs: this.#used, remainingGETs: 8 - this.#used, busy: this.#busy }; }
  report(): readonly ReadMetric[] { return structuredClone(this.#metrics); }
}
