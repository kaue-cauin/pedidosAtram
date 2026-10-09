import { fail } from '../security/errors.ts';
export interface Config {
  sync?: { detail:boolean;real:boolean; fixture:boolean; pageSize:number; maxPages:number; maxRecords:number; maxAttempts:number; intervalMs:number };
  databaseUrl: string; origin: string; host: string; port: number; secure: boolean;
  sessionSeconds: number; keys: Map<string, Buffer>; activeKey: string;
  tiny: { enabled: boolean; reads: boolean; refresh: boolean; clientId: string; clientSecret: string; callback: string };
}
export function readConfig(env: NodeJS.ProcessEnv): Config {
  let db: URL, origin: URL;
  try { db = new URL(env.DATABASE_URL!); origin = new URL(env.BACKEND_ORIGIN!); } catch { return fail('CONFIG_MISSING'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname || !db.pathname.slice(1)) fail('CONFIG_INVALID');
  if (origin.href !== origin.origin + '/' || origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol)) fail('CONFIG_INVALID');
  const secure = origin.protocol === 'https:';
  if (!secure && (env.BACKEND_ALLOW_LOOPBACK_HTTP !== 'yes' || origin.hostname !== '127.0.0.1')) fail('HTTPS_REQUIRED');
  if (secure && !['require', 'verify-full'].includes(db.searchParams.get('sslmode') ?? '') && env.BACKEND_DATABASE_PRIVATE_NETWORK !== 'yes') fail('DATABASE_TLS_REQUIRED');
  const port = Number(env.BACKEND_PORT ?? 8790), sessionSeconds = Number(env.BACKEND_SESSION_SECONDS ?? 28800);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(sessionSeconds) || sessionSeconds < 60 || sessionSeconds > 86400) fail('CONFIG_INVALID');
  const host = env.BACKEND_HOST ?? '127.0.0.1';
  if (!secure && (host !== '127.0.0.1' || Number(origin.port) !== port)) fail('CONFIG_INVALID');
  let values: unknown;
  try { values = JSON.parse(env.BACKEND_ENCRYPTION_KEYS ?? ''); } catch { return fail('ENCRYPTION_KEY_REQUIRED'); }
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('ENCRYPTION_KEY_REQUIRED');
  const keys = new Map<string, Buffer>();
  for (const [version, value] of Object.entries(values)) {
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(version) || typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) fail('ENCRYPTION_KEY_INVALID');
    keys.set(version, Buffer.from(value, 'hex'));
  }
  const activeKey = env.BACKEND_ACTIVE_KEY ?? '';
  if (!keys.has(activeKey)) fail('ENCRYPTION_KEY_REQUIRED');
  const callback = env.TINY_BACKEND_CALLBACK ?? origin.origin + '/api/erp/tiny/oauth/callback';
  if (callback !== origin.origin + '/api/erp/tiny/oauth/callback') fail('INVALID_CALLBACK');
  const enabled = env.TINY_BACKEND_OAUTH_ENABLED === 'yes';
  const tiny = { enabled, reads: env.TINY_BACKEND_READ_ENABLED === 'yes', refresh: env.TINY_BACKEND_REFRESH_ENABLED === 'yes', clientId: env.TINY_BACKEND_CLIENT_ID ?? '', clientSecret: env.TINY_BACKEND_CLIENT_SECRET ?? '', callback };
  if ((enabled && (!tiny.clientId || !tiny.clientSecret)) || (!enabled && (tiny.reads || tiny.refresh))) fail('TINY_CONFIG_INVALID');
  const bounded=(key:string,fallback:number,min:number,max:number)=>{ const n=Number(env[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)fail('SYNC_CONFIG_INVALID');return n; };
  const sync={detail:env.TINY_BACKEND_DETAIL_ENABLED==='yes',real:env.TINY_BACKEND_SYNC_ENABLED==='yes',fixture:env.BACKEND_SYNC_FIXTURE_ENABLED==='yes',pageSize:bounded('BACKEND_SYNC_PAGE_SIZE',25,1,50),maxPages:bounded('BACKEND_SYNC_MAX_PAGES',500,4,2000),maxRecords:bounded('BACKEND_SYNC_MAX_RECORDS',10000,1,10000),maxAttempts:bounded('BACKEND_SYNC_MAX_ATTEMPTS',3,1,5),intervalMs:bounded('BACKEND_SYNC_INTERVAL_MS',4000,4000,60000)};
  if(sync.detail&&!sync.real&&!sync.fixture)fail('SYNC_CONFIG_INVALID');
  if(sync.real&&(!tiny.enabled||!tiny.reads))fail('TINY_CONFIG_INVALID');
  return { sync, databaseUrl: db.href, origin: origin.origin, host, port, secure, sessionSeconds, keys, activeKey, tiny };
}
