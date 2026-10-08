import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { database } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
export async function isolatedDatabase() {
  const url = new URL(process.env.BACKEND_TEST_DATABASE_URL ?? '');
  assert.equal(process.env.BACKEND_TEST_DATABASE_APPROVED, 'yes', 'Explicit synthetic test database approval required');
  assert.match(url.pathname, /^\/atram_test[a-z0-9_-]*$/i, 'Test database must be named atram_test*');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only loopback test PostgreSQL');
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const control = postgres(url.href, { max: 1, onnotice: () => {} });
  await control`CREATE SCHEMA ${control(schema)}`;
  url.searchParams.set('options', '-c search_path=' + schema + ',public');
  const db = database(url.href);
  // Drizzle journal is scoped to the isolated schema, never global/shared.
  db.testSchema = schema;
  return { db, url: url.href, cleanup: async () => { await db.close(); await control`DROP SCHEMA ${control(schema)} CASCADE`; await control.end(); } };
}
test('7B.2A PostgreSQL: migrations, constraints, transactions, persistence and recovery', async () => {
  const fixture = await isolatedDatabase(); const { db } = fixture;
  try {
    await applyMigrations(db, db.testSchema);
    await applyMigrations(db, db.testSchema);
    const [a] = await db.client`INSERT INTO organizations(name) VALUES ('Synthetic A') RETURNING id`;
    const [b] = await db.client`INSERT INTO organizations(name) VALUES ('Synthetic B') RETURNING id`;
    const [u] = await db.client`INSERT INTO users(login,password_hash) VALUES ('synthetic','not-a-password') RETURNING id`;
    await assert.rejects(db.client`INSERT INTO users(login,password_hash) VALUES ('synthetic','x')`, { code: '23505' });
    await assert.rejects(db.client`INSERT INTO organization_memberships VALUES (${a.id},${randomUUID()},'ADMIN','ACTIVE')`, { code: '23503' });
    await db.client`INSERT INTO organization_memberships VALUES (${a.id},${u.id},'ADMIN','ACTIVE')`;
    await assert.rejects(db.client`INSERT INTO organization_memberships VALUES (${a.id},${u.id},'ADMIN','ACTIVE')`, { code: '23505' });
    await assert.rejects(db.client`INSERT INTO organization_memberships VALUES (${b.id},${u.id},'ROOT','ACTIVE')`, { code: '23514' });
    await assert.rejects(db.client.begin(async sql => { await sql`UPDATE organizations SET name='corrupt' WHERE id=${a.id}`; throw Error('rollback'); }));
    const anotherProcess = database(fixture.url);
    assert.equal((await anotherProcess.client`SELECT name FROM organizations WHERE id=${a.id}`)[0].name, 'Synthetic A');
    await anotherProcess.close();
    await db.client`INSERT INTO erp_connections(organization_id) VALUES (${a.id})`;
    await assert.rejects(db.client`INSERT INTO erp_connections(organization_id) VALUES (${a.id})`, { code: '23505' });
    assert.equal((await db.client`SELECT count(*)::int n FROM organizations`)[0].n, 2);
  } finally { await fixture.cleanup(); }
});
