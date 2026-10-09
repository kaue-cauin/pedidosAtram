import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/env.ts';
import { ready } from '../db/readiness.ts';
import { AuthService, admin, uuid, type Principal } from '../auth/service.ts';
import { hash } from '../security/crypto.ts';
import { BackendError, fail } from '../security/errors.ts';
import type { CatalogController } from '../catalog/controller.ts';
export interface TinyAdministration {
  status(p: Principal): Promise<unknown>;
  configure(p: Principal, document: string, correlation: string): Promise<void>;
  start(p: Principal, correlation: string): Promise<string>;
  callback(p: Principal, url: URL, correlation: string): Promise<void>;
  disconnect(p: Principal, correlation: string): Promise<void>;
  verify(p: Principal, correlation: string): Promise<unknown>;
}
async function body(req: IncomingMessage, keys: string[]): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '') || Number(req.headers['content-length'] ?? 0) > 16384) fail('INPUT_INVALID');
  const chunks: Buffer[] = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 16384) fail('INPUT_TOO_LARGE', 413); chunks.push(chunk); }
  let parsed: unknown; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('INPUT_INVALID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(k => !keys.includes(k))) fail('INPUT_INVALID');
  return parsed as Record<string, unknown>;
}
export function createBackendServer(config: Config, auth: AuthService, tiny?: TinyAdministration, log: (entry: { correlationId: string; code: string }) => void = () => {}, catalog?:CatalogController) {
  const cookieName = config.secure ? '__Host-atram_session' : 'atram_session';
  const server = createServer(async (req, res) => {
    const correlationId = randomUUID();
    res.setHeader('X-Correlation-ID', correlationId); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const json = (value: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const cookie = (value: string, seconds: number) => res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`);
    try {
      if (req.headers.host !== new URL(config.origin).host || !req.url?.startsWith('/') || req.url.startsWith('//') || req.url.length > 8192) fail('HOST_DENIED', 403);
      const url = new URL(req.url, config.origin), method = req.method ?? '';
      const callback = method === 'GET' && url.pathname === '/api/erp/tiny/oauth/callback';
      if (url.origin !== config.origin) fail('HOST_DENIED', 403);
      if (!callback && ((req.headers.origin && req.headers.origin !== config.origin) || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['sec-fetch-site'] !== 'none'))) fail('ORIGIN_DENIED', 403);
      if (method !== 'GET' && req.headers.origin !== config.origin) fail('ORIGIN_DENIED', 403);
      if (method === 'OPTIONS') fail('METHOD_DENIED', 405);
      if (method === 'GET' && url.pathname === '/api/health') return json({ healthy: true });
      if (method === 'GET' && url.pathname === '/api/ready') {
        try { await ready(auth.db); return json({ ready: true }); } catch { return json({ ready: false }, 503); }
      }
      const catalogGet=method==='GET'&&/^\/api\/(catalog\/(status|manifest|products|customers|sellers|price-lists|quarantine)|admin\/sync\/(jobs|status))$/.test(url.pathname);
      if (!callback && !catalogGet && url.search) fail('INPUT_INVALID');
      if (method === 'POST' && url.pathname === '/api/auth/login') {
        const data = await body(req, ['login', 'password', 'organizationId']);
        const result = await auth.login(data.login, data.password, data.organizationId, req.socket.remoteAddress ?? 'unknown', correlationId);
        cookie(result.token, config.sessionSeconds); return json({ user: result.principal, csrfToken: result.csrf });
      }
      const values = (req.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(cookieName + '='));
      if (values.length !== 1) fail('UNAUTHENTICATED', 401);
      const token = values[0].slice(cookieName.length + 1), p = await auth.authenticate(token);
      if (method !== 'GET') await auth.checkCSRF(p, String(req.headers['x-csrf-token'] ?? ''));
      if (method === 'GET' && url.pathname === '/api/auth/me') return json({ user: p, csrfToken: hash('csrf:' + token) });
      if (method === 'POST' && url.pathname === '/api/auth/logout') { await body(req, []); await auth.logout(p, correlationId); cookie('', 0); return json({ loggedOut: true }); }
      if (method === 'GET' && url.pathname === '/api/organization/current') {
        const [org] = await auth.db.client`SELECT id,name,status FROM organizations WHERE id=${p.organizationId}`; return json(org);
      }
      if(catalogGet){if(!catalog)fail('NOT_CONFIGURED',503);return json(await catalog.get(p,url.pathname,url.searchParams));}
      const catalogPost=method==='POST'&&/^\/api\/admin\/(sync\/(start|cancel|resume|step)|catalog\/(activate|rollback))$/.test(url.pathname);
      if(catalogPost){admin(p);if(!catalog)fail('NOT_CONFIGURED',503);const keys=url.pathname.endsWith('/start')?['mode','details']:url.pathname.includes('/catalog/')?['version','expectedVersion','acknowledge']:['id'];return json(await catalog.post(p,url.pathname,await body(req,keys)));}
      admin(p);
      if (method === 'GET' && url.pathname === '/api/admin/users') return json(await auth.listUsers(p));
      if (method === 'POST' && url.pathname === '/api/admin/users') {
        const data = await body(req, ['login', 'password', 'role']);
        if (typeof data.password !== 'string') fail('INPUT_INVALID');
        return json(await auth.createUser(p, data.login, data.password, data.role, correlationId), 201);
      }
      const userAction = /^\/api\/admin\/users\/([^/]+)\/(deactivate|reset-password)$/.exec(url.pathname);
      if (method === 'POST' && userAction) {
        if (!uuid(userAction[1])) fail('INPUT_INVALID');
        const data = await body(req, userAction[2] === 'deactivate' ? [] : ['password']);
        if (userAction[2] === 'reset-password' && typeof data.password !== 'string') fail('INPUT_INVALID');
        await auth.manageUser(p, userAction[1], userAction[2] === 'deactivate' ? 'deactivate' : 'reset', data.password as string | undefined, correlationId); return json({ updated: true });
      }
      if (method === 'GET' && url.pathname === '/api/admin/audit') return json(await auth.db.client`SELECT id,user_id,action,result,correlation_id,created_at FROM audit_events WHERE organization_id=${p.organizationId} ORDER BY created_at DESC LIMIT 100`);
      if (!tiny) fail('NOT_CONFIGURED', 503);
      if (method === 'GET' && url.pathname === '/api/erp/tiny/status') return json(await tiny.status(p));
      if (method === 'POST' && url.pathname === '/api/erp/tiny/configure-account') { const data = await body(req, ['expectedDocument']); if (typeof data.expectedDocument !== 'string') fail('INPUT_INVALID'); await tiny.configure(p, data.expectedDocument, correlationId); return json({ configured: true }); }
      if (method === 'POST' && url.pathname === '/api/erp/tiny/oauth/start') { await body(req, []); return json({ authorizationUrl: await tiny.start(p, correlationId) }); }
      if (callback) {
        try { await tiny.callback(p, url, correlationId); } catch { log({ correlationId, code: 'OAUTH_CALLBACK_FAILED' }); }
        // Never render or repeat callback codes/state. Same-origin fixed destination strips query.
        res.writeHead(303, { Location: '/api/erp/tiny/status' }); res.end(); return;
      }
      if (method === 'POST' && url.pathname === '/api/erp/tiny/disconnect') { await body(req, []); await tiny.disconnect(p, correlationId); return json({ disconnected: true }); }
      if (method === 'POST' && url.pathname === '/api/erp/tiny/verify-account') { await body(req, []); return json(await tiny.verify(p, correlationId)); }
      fail('NOT_FOUND', 404);
    } catch (e) {
      const code = e instanceof BackendError ? e.code : 'SERVICE_UNAVAILABLE';
      log({ correlationId, code }); if (!res.headersSent) json({ error: { code, correlationId } }, e instanceof BackendError ? e.status : 503); else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 30;
  return server;
}
