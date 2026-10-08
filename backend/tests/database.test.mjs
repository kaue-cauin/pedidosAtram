import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
import { isolatedDatabase } from './fixtures.mjs';
test('7B.2A PostgreSQL: migrations, constraints, transactions, persistence and recovery', async () => {
  const fixture = await isolatedDatabase(); const { db } = fixture;
  try {
    await applyMigrations(db);
    await applyMigrations(db);
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
    const child = execFileSync(process.execPath, ['--input-type=module','-e', `import {database} from './backend/db/client.ts'; const db=database(process.env.RESTART_TEST_URL); try { console.log((await db.client.unsafe('SELECT count(*)::int n FROM organizations'))[0].n); } finally { await db.close(); }`], {env:{...process.env,RESTART_TEST_URL:fixture.url},encoding:'utf8'});
    assert.equal(child.trim(),'2');
    await db.client`INSERT INTO erp_connections(organization_id) VALUES (${a.id})`;
    await assert.rejects(db.client`INSERT INTO erp_connections(organization_id) VALUES (${a.id})`, { code: '23505' });
    assert.equal((await db.client.unsafe('SELECT count(*)::int n FROM organizations'))[0].n, 2);
  } finally { await fixture.cleanup(); }
});
