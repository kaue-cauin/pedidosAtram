import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { POCError } from './config.ts';
import type { POCConfig, Resource } from './config.ts';
import { equalSecret, TinyOAuthSession } from './oauth.ts';
import { TinyReadClient } from './read-client.ts';
import type { Fetcher } from './transport.ts';
export function createPOCServer(config: POCConfig, fetcher: Fetcher = fetch) {
  const oauth = new TinyOAuthSession(config, fetcher), client = new TinyReadClient(config, oauth, fetcher);
  const origin = new URL(config.redirectUri).origin;
  const cookieName = 'atram_poc';
  const cookieValue = (req: IncomingMessage) => {
    const cookies = (req.headers.cookie ?? '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookieName + '='));
    return cookies.length === 1 ? cookies[0].slice(cookieName.length + 1) : '';
  };
  const authenticated = (req: IncomingMessage) => {
    const header = req.headers.authorization ?? '';
    if (header.length > 1024) return false;
    if (header.startsWith('Bearer ')) return equalSecret(header.slice(7), config.adminKey);
    if (header.startsWith('Basic ')) return equalSecret(Buffer.from(header.slice(6), 'base64').toString('utf8'), 'poc:' + config.adminKey);
    return false;
  };
  const send = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
  };
  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    try {
      if (req.headers.host !== new URL(origin).host || !req.url?.startsWith('/') || req.url.startsWith('//') || req.url.length > 8192) return send(res, 400, { error: 'INVALID_REQUEST' });
      const url = new URL(req.url, origin);
      if (url.pathname === '/oauth/callback' && req.method === 'GET') {
        await oauth.callback(url, cookieValue(req));
        // Remove code/state from the visible address immediately, without echoing values.
        res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/oauth/callback; Max-Age=0`);
        res.writeHead(303, { Location: '/status' }); res.end(); return;
      }
      if (!authenticated(req)) { res.setHeader('WWW-Authenticate', 'Basic realm="Atram POC local"'); return send(res, 401, { error: 'LOCAL_AUTH_REQUIRED' }); }
      // The callback's cross-site redirect chain can reach this authenticated, side-effect-free status page.
      // Keep state-changing controls and the report restricted to the local origin; no CORS is granted.
      const safeStatus = req.method === 'GET' && url.pathname === '/status' && !url.search;
      if (!safeStatus && ((req.headers.origin && req.headers.origin !== origin) || ['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'] as string))) return send(res, 403, { error: 'ORIGIN_DENIED' });
      if (req.method === 'GET' && url.pathname === '/oauth/start' && !url.search) {
        client.disconnect(); const started = oauth.start();
        res.setHeader('Set-Cookie', `${cookieName}=${started.cookie}; HttpOnly; SameSite=Lax; Path=/oauth/callback; Max-Age=300`);
        res.writeHead(302, { Location: started.url }); res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/status' && !url.search) return send(res, 200, client.status());
      if (req.method === 'GET' && url.pathname === '/report' && !url.search) return send(res, 200, { mode: 'read-only-poc', oauth: oauth.report(), metrics: client.report() });
      if (req.method === 'POST' && url.pathname === '/disconnect' && !url.search) { client.disconnect(); return send(res, 200, { disconnected: true, remoteRevocation: 'not-implemented' }); }
      if (req.method === 'POST' && url.pathname === '/read' && [...url.searchParams.keys()].length === 1 && url.searchParams.getAll('resource').length === 1) {
        return send(res, 200, await client.read(url.searchParams.get('resource') as Resource));
      }
      send(res, 404, { error: 'ROUTE_DENIED' });
    } catch (error) { send(res, 400, { error: error instanceof POCError ? error.kind : 'POC_FAILED' }); }
  };
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => { void handler(req, res); });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.maxConnections = 8;
  server.on('close', () => client.disconnect());
  // Inactivity/abandoned browser must not retain tokens for an indefinite process lifetime.
  const expiry = setTimeout(() => { client.disconnect(); server.close(); }, 30 * 60_000); expiry.unref();
  server.on('close', () => clearTimeout(expiry));
  return server;
}
