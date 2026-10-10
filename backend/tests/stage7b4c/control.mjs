import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import postgres from 'postgres';
const run = promisify(execFile);
export function testUrl(name) { const url = new URL(process.env[name] ?? ''); assert.equal(process.env.BACKEND_TEST_DATABASE_APPROVED, 'yes'); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname)); assert.match(url.pathname, /^\/atram_test[a-z0-9_-]*$/i); return url; }
export async function checkInfrastructure() {
    const app = testUrl('BACKEND_TEST_DATABASE_URL'), sim = testUrl('SIM_TEST_DATABASE_URL');
    assert.notEqual(app.port, sim.port, 'Two independent PostgreSQL instances are required');
    const pools = [app, sim].map(u => postgres(u.href, { max: 1, connect_timeout: 2, onnotice: () => { } }));
    try {
        const identifiers = await Promise.all(pools.map(async (sql) => { const [r] = await sql `SELECT system_identifier::text id FROM pg_control_system()`; return r.id; }));
        assert.notEqual(...identifiers, 'PostgreSQL system identifiers must differ');
        await run('pg_dump', ['--version']);
        await run('pg_restore', ['--version']);
        await containers();
        return { identifiers };
    }
    finally {
        await Promise.all(pools.map(p => p.end({ timeout: 2 })));
    }
}
async function containers() {
    assert.equal(process.env.LAB_POSTGRES_INTERRUPTION_APPROVED, 'yes', 'Only explicitly approved disposable PostgreSQL containers may be interrupted');
    const ids = [process.env.APP_TEST_POSTGRES_CONTAINER, process.env.SIM_TEST_POSTGRES_CONTAINER];
    assert.ok(ids.every(id => /^[a-f0-9]{12,64}$/.test(id ?? '')));
    assert.notEqual(...ids);
    for (const [i, id] of ids.entries()) {
        const { stdout } = await run('docker', ['inspect', id]);
        const [c] = JSON.parse(stdout);
        assert.match(c.Config.Image, /^postgres:16(?:$|@)/);
        assert.equal(c.Config.Env.find(x => x.startsWith('POSTGRES_DB=')), i === 0 ? 'POSTGRES_DB=atram_test_ci' : 'POSTGRES_DB=atram_test_sim_ci');
        const ports = c.NetworkSettings.Ports['5432/tcp'];
        assert.ok(ports.some(p => p.HostPort === (i === 0 ? testUrl('BACKEND_TEST_DATABASE_URL') : testUrl('SIM_TEST_DATABASE_URL')).port), 'Container must match configured test database port');
    }
    return ids;
}
export async function stopDatabase(kind, log) { const ids = await containers(), id = ids[kind === 'app' ? 0 : 1]; await run('docker', ['stop', '--time', '1', id]); log.push({ event: 'DATABASE_STOPPED', kind, containerId: id, at: new Date().toISOString() }); }
export async function startDatabase(kind, log) { const id = process.env[kind === 'app' ? 'APP_TEST_POSTGRES_CONTAINER' : 'SIM_TEST_POSTGRES_CONTAINER']; await run('docker', ['start', id]); const u = testUrl(kind === 'app' ? 'BACKEND_TEST_DATABASE_URL' : 'SIM_TEST_DATABASE_URL'); let last; for (let n = 0; n < 100; n++) {
    const sql = postgres(u.href, { max: 1, connect_timeout: 1, onnotice: () => { } });
    try {
        await sql `SELECT 1`;
        log.push({ event: 'DATABASE_RESTARTED', kind, at: new Date().toISOString() });
        return;
    }
    catch (e) {
        last = e;
        await new Promise(r => setTimeout(r, 100));
    }
    finally {
        await sql.end({ timeout: 1 });
    }
} throw last; }
export async function dump(url, path) { testUrl('BACKEND_TEST_DATABASE_URL'); assert.match(new URL(url).pathname, /^\/atram_test_/); await run('pg_dump', ['--dbname=' + url, '--format=custom', '--file=' + path]); }
export async function restore(url, path) { assert.match(new URL(url).pathname, /^\/atram_test_/); await run('pg_restore', ['--dbname=' + url, '--clean', '--if-exists', '--no-owner', path]); }
