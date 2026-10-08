import { POCError } from './config.ts';
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type Quota = { limit?: number; remaining?: number; resetSeconds?: number; retryAfterSeconds?: number };
export class TransportError extends POCError {
  readonly quota: Quota;
  constructor(kind: string, status: number, quota: Quota) { super(kind, status); this.quota = quota; }
}
export function quota(headers: Headers, now = Date.now()): Quota {
  const number = (key: string) => {
    const value = headers.get(key);
    return value !== null && /^\d{1,10}$/.test(value) ? Number(value) : undefined;
  };
  const result: Quota = { limit: number('X-RateLimit-Limit'), remaining: number('X-RateLimit-Remaining'), resetSeconds: number('X-RateLimit-Reset') };
  const retry = headers.get('Retry-After');
  if (retry && /^\d{1,10}$/.test(retry)) result.retryAfterSeconds = Number(retry);
  else if (retry && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retry)) {
    const time = Date.parse(retry); if (Number.isFinite(time)) result.retryAfterSeconds = Math.max(0, Math.ceil((time - now) / 1000));
  }
  return result;
}
// The deadline covers response headers AND body. Redirects never forward credentials.
export async function requestJSON(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs = 10_000, maxBytes = 1_048_576, decode: (text:string)=>unknown = JSON.parse): Promise<{ data: unknown; status: number; quota: Quota }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new POCError('TIMEOUT')), { once: true }));
  const work = async () => {
    try {
      const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal, cache: 'no-store' });
      const limits = quota(response.headers);
      if (!response.ok) { await response.body?.cancel(); return { data: undefined, status: response.status, quota: limits }; }
      if (!/^application\/json\b/i.test(response.headers.get('Content-Type') ?? '')) { await response.body?.cancel(); throw new TransportError('INVALID_JSON', response.status, limits); }
      const reader = response.body?.getReader();
      if (!reader) throw new TransportError('INVALID_JSON', response.status, limits);
      controller.signal.addEventListener('abort', () => { void reader.cancel().catch(() => {}); }, { once: true });
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength; if (bytes > maxBytes) throw new TransportError('BODY_TOO_LARGE', response.status, limits); chunks.push(part.value);
        }
      } catch (error) { void reader.cancel().catch(() => {}); throw error; }
      try { return { data: decode(Buffer.concat(chunks).toString('utf8')), status: response.status, quota: limits }; }
      catch { throw new TransportError('INVALID_JSON', response.status, limits); }
    } catch (error) { if (error instanceof POCError) throw error; throw new POCError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'); }
  };
  try { return await Promise.race([work(), aborted]); }
  finally { clearTimeout(timer); }
}
