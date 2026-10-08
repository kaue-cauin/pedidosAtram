export const TINY_API = 'https://api.tiny.com.br/public-api/v3';
export const TINY_AUTH = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth';
export const TINY_TOKEN = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
export type Resource = 'info' | 'products' | 'contacts' | 'sellers' | 'priceLists' | 'productDetail' | 'priceListDetail';
export interface POCConfig {
  clientId: string; clientSecret: string; adminKey: string; redirectUri: string;
  accountDocument: string; resources: readonly Resource[]; pkce: 'S256' | 'unsupported';
  allowRefresh: boolean; productId?: number; priceListId?: number;
}
export class POCError extends Error {
  readonly kind: string; readonly status: number;
  constructor(kind: string, status = 0) { super(kind); this.name = 'POCError'; this.kind = kind; this.status = status; }
}
export function readConfig(env: NodeJS.ProcessEnv): POCConfig {
  // This attestation represents the seven prerequisites recorded by the operator, not authorization inferred from OAuth.
  const required = ['TINY_POC_ACCOUNT_DOCUMENT', 'TINY_POC_PLAN', 'TINY_POC_USER', 'TINY_POC_CLIENT_ID',
    'TINY_POC_CLIENT_SECRET', 'TINY_POC_ADMIN_KEY', 'TINY_POC_REDIRECT_URI', 'TINY_POC_READ_RESOURCES'];
  if (env.TINY_POC_APPROVED !== 'yes' || required.some(k => !env[k]?.trim())) throw new POCError('CONFIG_PENDING');
  const adminKey = env.TINY_POC_ADMIN_KEY!;
  if (adminKey.length < 32 || adminKey.length > 256 || !/^[A-Za-z0-9_-]+$/.test(adminKey)) throw new POCError('CONFIG_INVALID');
  let uri: URL;
  try { uri = new URL(env.TINY_POC_REDIRECT_URI!); } catch { throw new POCError('CONFIG_INVALID'); }
  // Intentionally local-only. A public deployment needs a separate reviewed deployment design.
  if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || !uri.port ||
      uri.pathname !== '/oauth/callback' || uri.search || uri.hash || uri.username || uri.password ||
      uri.href !== env.TINY_POC_REDIRECT_URI) throw new POCError('CONFIG_INVALID');
  const port = Number(uri.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new POCError('CONFIG_INVALID');
  const pkceSetting = env.TINY_POC_PKCE_SUPPORT;
  if (pkceSetting !== 'confirmed-s256' && pkceSetting !== 'confirmed-unsupported') throw new POCError('PKCE_PENDING');
  const names = env.TINY_POC_READ_RESOURCES!.split(',').map(x => x.trim());
  const allowed: Resource[] = ['info', 'products', 'contacts', 'sellers', 'priceLists', 'productDetail', 'priceListDetail'];
  if (!names.includes('info') || names.some(x => !allowed.includes(x as Resource))) throw new POCError('CONFIG_INVALID');
  const id = (value: string | undefined) => {
    if (!value) return undefined;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new POCError('CONFIG_INVALID');
    return Number(value);
  };
  const productId = id(env.TINY_POC_PRODUCT_ID), priceListId = id(env.TINY_POC_PRICE_LIST_ID);
  if ((names.includes('productDetail') && !productId) || (names.includes('priceListDetail') && !priceListId)) throw new POCError('CONFIG_INVALID');
  const accountDocument = env.TINY_POC_ACCOUNT_DOCUMENT!.replace(/[.\-/ ]/g, '');
  if (!/^\d{11}$|^\d{14}$/.test(accountDocument)) throw new POCError('CONFIG_INVALID');
  return { clientId: env.TINY_POC_CLIENT_ID!, clientSecret: env.TINY_POC_CLIENT_SECRET!, adminKey,
    redirectUri: uri.href, accountDocument, resources: names as Resource[], pkce: pkceSetting === 'confirmed-s256' ? 'S256' : 'unsupported',
    allowRefresh: env.TINY_POC_REFRESH_AUTHORIZED === 'yes', productId, priceListId };
}
