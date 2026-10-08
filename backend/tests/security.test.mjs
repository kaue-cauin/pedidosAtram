import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readConfig } from '../config/env.ts';
import { Vault, passwordHash, passwordMatches } from '../security/crypto.ts';
test('configuration fails closed, loopback only HTTP and real Tiny disabled', () => {
  assert.throws(() => readConfig({}), /CONFIG_MISSING/);
  const base={DATABASE_URL:'postgres://localhost/atram_test',BACKEND_ORIGIN:'http://127.0.0.1:8790',BACKEND_ALLOW_LOOPBACK_HTTP:'yes',BACKEND_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('hex')}),BACKEND_ACTIVE_KEY:'v1'};
  const config=readConfig(base); assert.equal(config.tiny.enabled,false); assert.equal(config.tiny.reads,false);
  assert.throws(()=>readConfig({...base,BACKEND_ENCRYPTION_KEYS:''}),/ENCRYPTION_KEY/);
  assert.throws(()=>readConfig({...base,BACKEND_ORIGIN:'http://example.com'}),/HTTPS_REQUIRED/);
  assert.throws(()=>readConfig({...base,TINY_BACKEND_CALLBACK:'https://attacker.test/callback'}),/INVALID_CALLBACK/);
  assert.throws(()=>readConfig({...base,TINY_BACKEND_OAUTH_ENABLED:'yes'}),/TINY_CONFIG_INVALID/);
});
test('AES-GCM randomized IV, authentication, AAD tenant/type/version binding and rotation',()=>{
  const keys=new Map([['v1',randomBytes(32)],['v2',randomBytes(32)]]), vault=new Vault(keys,'v1');
  const a=vault.seal('synthetic-token','A','access'),b=vault.seal('synthetic-token','A','access');
  assert.notEqual(a,b);assert.ok(!a.includes('synthetic-token'));assert.equal(vault.open(a,'A','access'),'synthetic-token');
  for(const [tenant,kind] of [['B','access'],['A','refresh']]) assert.throws(()=>vault.open(a,tenant,kind),/SECRET_UNAVAILABLE/);
  assert.throws(()=>vault.open(a.slice(0,-3)+'xxx','A','access'),/SECRET_UNAVAILABLE/);
  assert.throws(()=>new Vault(new Map([['v1',randomBytes(32)]]),'v1').open(a,'A','access'),/SECRET_UNAVAILABLE/);
  const rotated=new Vault(keys,'v2');assert.equal(rotated.open(a,'A','access'),'synthetic-token');
  assert.ok(rotated.seal('token','A','access').startsWith('v2.'));assert.throws(()=>new Vault(new Map(),'v1'));
});
test('async scrypt passwords, random salt, constant-time digest compare and policy',async()=>{
  const p='synthetic-long-password',h=await passwordHash(p);assert.ok(!h.includes(p));assert.notEqual(h,await passwordHash(p));
  assert.equal(await passwordMatches(p,h),true);assert.equal(await passwordMatches('wrong',h),false);assert.equal(await passwordMatches(p,'invalid'),false);await assert.rejects(passwordHash('short'),/PASSWORD_POLICY/);
});
