import '../stage7b4b/no-network.mjs';
import { fork, execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { fixture as ledgerFixture } from '../stage7b4b/fixtures.mjs';
import { testUrl } from './control.mjs';
import { SimulatorStore, simulatorDDL } from './simulator-store.ts';
import { LabAttestor } from '../../submissions/lab/observer.ts';
export class Child {
    constructor(file, env, log) { this.messages = []; this.waiters = new Set(); this.log = log; this.process = fork(fileURLToPath(new URL(file, import.meta.url)), [], { env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); this.stderr = ''; this.process.stderr.on('data', b => { this.stderr += b.toString(); }); this.process.on('message', m => { this.messages.push(m); log.push({ pid: this.process.pid, at: new Date().toISOString(), ...m }); this.notify(); }); this.exit = new Promise(resolve => this.process.once('exit', (code, signal) => { this.exited = { code, signal }; log.push({ event: 'PROCESS_EXIT', pid: this.process.pid, code, signal }); this.notify(); resolve(this.exited); })); this.process.on('error', () => this.notify()); }
    notify() { for (const resolve of this.waiters)
        resolve(); this.waiters.clear(); }
    async wait(predicate, ms = 20000) { const deadline = Date.now() + ms; for (;;) {
        const found = this.messages.find(predicate);
        if (found)
            return found;
        if (this.exited)
            throw Error('CHILD_EXITED_BEFORE_EXPECTED_BARRIER');
        if (Date.now() >= deadline)
            throw Error('CHILD_BARRIER_TIMEOUT');
        await new Promise(resolve => { this.waiters.add(resolve); const t = setTimeout(() => { this.waiters.delete(resolve); resolve(); }, 50); t.unref(); });
    } }
    async ready() { await this.wait(m => m.ready); return this; }
    async barrier(name) { return this.wait(m => m.barrier === name); }
    release(message) { this.process.send({ release: message.n }); }
    start() { this.process.send({ start: true }); }
    async result() { const m = await this.wait(m => Object.hasOwn(m, 'result') || m.error, 40000); await this.exit; return m; }
    async signal(signal) { assert.ok(!this.exited); assert.equal(this.process.kill(signal), true); this.log.push({ event: 'SIGNAL_SENT', pid: this.process.pid, signal }); if (signal === 'SIGSTOP') {
        const { readFile } = await import('node:fs/promises');
        for (let i = 0; i < 100; i++) {
            const s = await readFile('/proc/' + this.process.pid + '/status', 'utf8');
            if (/^State:\s+[Tt]/m.test(s)) {
                this.log.push({ event: 'PROCESS_STOP_CONFIRMED', pid: this.process.pid });
                return;
            }
            await new Promise(r => setTimeout(r, 10));
        }
        throw Error('SIGSTOP_NOT_CONFIRMED');
    } if (signal === 'SIGKILL')
        assert.equal((await this.exit).signal, 'SIGKILL'); }
    async close() { if (!this.exited) {
        this.process.kill('SIGCONT');
        this.process.kill('SIGKILL');
        await this.exit;
    } }
}
export async function fixture() {
    const app = await ledgerFixture(), dir = await mkdtemp(join(tmpdir(), 'atram-c-')), u = testUrl('SIM_TEST_DATABASE_URL'), control = postgres(u.href, { max: 1, connect_timeout: 3, onnotice: () => { } }), name = 'atram_test_sim_' + randomUUID().replaceAll('-', '');
    let store;
    try {
        await control `CREATE DATABASE ${control(name)}`;
        u.pathname = '/' + name;
        store = new SimulatorStore(u.href);
        await store.sql.unsafe(simulatorDDL);
        const log = [], children = [], attestor = new LabAttestor(app.repo, app.admin);
        const f = { ...app, dir, simUrl: u.href, store, log, children, attestor, active: null,
            async simulator(options = {}) { const path = join(dir, 'sim-' + randomUUID().slice(0, 8) + '.sock'); const child = new Child('./simulator.mjs', { SIM_WORKER_CONFIG: JSON.stringify({ url: u.href, path, ...options }) }, log); children.push(child); await child.ready(); return { child, path }; },
            async worker(a, sim, options = {}) { const child = new Child('./worker.mjs', { EXEC_WORKER_CONFIG: JSON.stringify({ url: app.runtimeUrl, gatePath: app.gatePath, admin: app.admin, principal: app.op, input: a.confirm, path: sim.path, ...options }) }, log); children.push(child); await child.ready(); return child; },
            async setup() { const a = await app.admitted(); a.confirm = app.decision(a); f.active = a; return a; },
            async counts(a = f.active) { const sim = await store.counts(); if (!a)
                return [log.filter(x => x.invoked).length, sim.received, sim.created, 0, 0, 0]; const [r] = await app.db.client `SELECT (SELECT count(*)::int FROM submission_communications WHERE submission_id=${a.input.submissionId} AND kind='CREATE') o,(SELECT count(*)::int FROM submission_events WHERE order_id=${a.orderId})-2 e,(SELECT count(*)::int FROM submission_evidence WHERE submission_id=${a.input.submissionId}) v`; return [log.filter(x => x.invoked).length, sim.received, sim.created, r.o, r.e, r.v]; },
            async assertCounts(expected) { const actual = await f.counts(); log.push({ event: 'COUNTS', I_R_P_O_E_V: actual }); assert.deepEqual(actual, expected); },
            async state() { return (await app.repo.read(app.admin, f.active.orderId, f.active.input.submissionId)).projection; },
            async binding() { const r = await app.repo.read(app.admin, f.active.orderId, f.active.input.submissionId), s = r.projection.submission, c = r.communications.at(-1), request = app.protection.open(r.request, { organizationId: app.org ?? app.op.organizationId, orderId: f.active.orderId, submissionId: f.active.input.submissionId, kind: 'request', digest: s.requestHash }); return { version: 1, organizationId: app.op.organizationId, orderId: f.active.orderId, submissionId: f.active.input.submissionId, operationId: c.operation_id, executionId: c.execution_id, account: s.account, generation: 1, businessHash: s.businessHash, requestHash: s.requestHash, mapper: s.mapperVersion ?? 'fixture-identity-v1', canonical: 'legacy-order-canonical-v1', contract: 'submission-ledger-v1', request, remainingMs: 30000, expiresMonotonicMs: 0 }; },
            async manifest(id, status, error) { await mkdir('test-results/7b4c', { recursive: true }); const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); await writeFile('test-results/7b4c/' + id + '.json', JSON.stringify({ id, status, sha, error: error ? 'ASSERTION_OR_INFRASTRUCTURE_FAILURE' : null, log }, null, 2)); },
            async cleanup() { for (const c of children)
                await c.close(); await store.close(); await control `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=${name} AND pid<>pg_backend_pid()`; await control `DROP DATABASE ${control(name)}`; await control.end(); await app.cleanup(); await rm(dir, { recursive: true, force: true }); } };
        return f;
    }
    catch (error) {
        if (store)
            await store.close();
        await control.end();
        await app.cleanup();
        await rm(dir, { recursive: true, force: true });
        throw error;
    }
}
