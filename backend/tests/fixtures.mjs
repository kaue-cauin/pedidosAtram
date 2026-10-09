import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { database } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
import { AuthService } from '../auth/service.ts';
import { passwordHash } from '../security/crypto.ts';
export async function isolatedDatabase() {
  const url = new URL(process.env.BACKEND_TEST_DATABASE_URL ?? '');
  assert.equal(process.env.BACKEND_TEST_DATABASE_APPROVED, 'yes', 'Explicit synthetic test database approval required');
  assert.match(url.pathname, /^\/atram_test[a-z0-9_-]*$/i, 'Test database must be named atram_test*');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only loopback test PostgreSQL');
  const name = 'atram_test_' + randomUUID().replaceAll('-', '');
  const control = postgres(url.href, { max: 1, onnotice: () => {} });
  await control`CREATE DATABASE ${control(name)}`;
  url.pathname = '/' + name;
  const db = database(url.href);
  return { db, url: url.href, cleanup: async () => {
    await db.close();
    await control`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`;
    await control`DROP DATABASE ${control(name)}`; await control.end();
  } };
}
export async function authFixture() {
  const f=await isolatedDatabase();
  try { await applyMigrations(f.db); } catch (error) { await f.cleanup(); throw error; }
  const auth=new AuthService(f.db,3600), password='Synthetic-secure-password!';
  const a=await auth.bootstrap('Synthetic A','admin-a',password);
  const [b]=await f.db.client`INSERT INTO organizations(name) VALUES ('Synthetic B') RETURNING id`;
  const [u]=await f.db.client`INSERT INTO users(login,password_hash) VALUES ('admin-b',${await passwordHash(password)}) RETURNING id`;
  await f.db.client`INSERT INTO organization_memberships VALUES (${b.id},${u.id},'ADMIN','ACTIVE')`;
  const sa=await auth.login('admin-a',password,undefined,'a'),sb=await auth.login('admin-b',password,undefined,'b');
  return {...f,auth,password,a,b,userB:u,sa,sb};
}
