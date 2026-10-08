import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { fail } from './errors.ts';
export const secret = () => randomBytes(32).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
export class Vault {
  private keys: Map<string, Buffer>; readonly active: string;
  constructor(keys: Map<string, Buffer>, active: string) {
    if (!keys.has(active) || [...keys.values()].some(k => k.length !== 32)) fail('ENCRYPTION_KEY_REQUIRED');
    this.keys = keys; this.active = active;
  }
  seal(value: string, organization: string, kind: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.keys.get(this.active)!, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([organization, kind, this.active])));
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [this.active, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
  }
  open(envelope: string, organization: string, kind: string): string {
    try {
      const [version, iv, tag, body, extra] = envelope.split('.');
      const key = this.keys.get(version);
      if (!key || extra !== undefined || !body || Buffer.from(iv, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16) throw Error();
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      cipher.setAAD(Buffer.from(JSON.stringify([organization, kind, version]))); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([cipher.update(Buffer.from(body, 'base64url')), cipher.final()]).toString('utf8');
    } catch { return fail('SECRET_UNAVAILABLE', 503); }
  }
}
// scrypt N=2^17, r=8, p=1: 128 MiB memory cost, asynchronous libuv work.
const options = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, options, (err, key) => err ? reject(err) : resolve(key)));
export async function passwordHash(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256) fail('PASSWORD_POLICY');
  const salt = randomBytes(16); return 'scrypt-v1.' + salt.toString('hex') + '.' + (await derive(password, salt)).toString('hex');
}
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 256) return false;
  const [version, salt, value] = stored.split('.');
  if (version !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(value ?? '')) return false;
  return timingSafeEqual(await derive(password, Buffer.from(salt, 'hex')), Buffer.from(value, 'hex'));
}
