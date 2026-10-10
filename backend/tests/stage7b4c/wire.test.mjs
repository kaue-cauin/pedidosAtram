// U tests exercise policy, process-local control and real Unix sockets/signals.
// The coordinator double is explicitly NOT PostgreSQL or durable-ledger evidence.
import '../stage7b4b/no-network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicBinding } from '../../submissions/lab/contracts.ts';
import { UnixSyntheticTransport } from '../../submissions/lab/transport.ts';
import { Child } from './harness.mjs';
function binding() { return { version: 1, organizationId: randomUUID(), orderId: randomUUID(), submissionId: randomUUID(), operationId: randomUUID(), executionId: randomUUID(), account: 'lab:synthetic', generation: 1, businessHash: 'a'.repeat(64), requestHash: 'b'.repeat(64), mapper: 'fixture-identity-v1', canonical: 'legacy-order-canonical-v1', contract: 'submission-ledger-v1', request: 'synthetic', remainingMs: 30000, expiresMonotonicMs: performance.now() + 30000 }; }
async function socketTest(run) { const dir = await mkdtemp(join(tmpdir(), 'atram-u-')), path = join(dir, 'wire.sock'), sockets = new Set(); let server; try {
    const create = async (handler) => { server = net.createServer(s => { sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => { }); handler(s); }); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); }); };
    await run({ path, create });
}
finally {
    for (const s of sockets)
        s.destroy();
    if (server?.listening)
        await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
} }
test('U15 real Unix socket: timeout followed by same-socket late proof, one packet', async () => socketTest(async ({ path, create }) => { const b = binding(); let packets = 0, I = 0; await create(s => s.once('data', () => { packets++; setTimeout(() => s.end(JSON.stringify({ binding: publicBinding(b), status: 200, kind: 'ACCEPTED', externalId: 'late' }) + '\n'), 100); })); const o = []; for await (const x of new UnixSyntheticTransport(path, 20, 500, () => I++).observe(b))
    o.push(x); assert.deepEqual(o.map(x => x.type), ['uncertain', 'response']); assert.equal(o[0].reason, 'TRANSPORT_TIMEOUT'); assert.deepEqual([I, packets], [1, 1]); }));
test('U16 real Unix socket: lost response cannot establish absence', async () => socketTest(async ({ path, create }) => { let packets = 0; await create(s => s.once('data', () => { packets++; s.destroy(); })); const o = []; for await (const x of new UnixSyntheticTransport(path, 50, 100).observe(binding()))
    o.push(x); assert.equal(packets, 1); assert.equal(o[0].type, 'uncertain'); }));
test('U17 actual independent child SIGKILL after packet; no response evidence', async () => socketTest(async ({ path, create }) => { const log = []; let packets = 0; await create(s => s.once('data', () => { packets++; })); const child = await new Child('./wire-child.mjs', { WIRE_CHILD_CONFIG: JSON.stringify({ path, binding: binding(), timeoutMs: 1000, lateWindowMs: 3000 }) }, log).ready(); try {
    child.start();
    await child.wait(m => m.invoked);
    for (let i = 0; i < 100 && packets === 0; i++)
        await new Promise(r => setTimeout(r, 10));
    assert.equal(packets, 1);
    await child.signal('SIGKILL');
    assert.equal(child.messages.filter(x => x.observation).length, 0);
    assert.ok(log.some(x => x.event === 'PROCESS_EXIT' && x.signal === 'SIGKILL'));
}
finally {
    await child.close();
} }));
test('U18 actual SIGSTOP/SIGCONT/SIGKILL with confirmed process state', async () => { const log = [], child = await new Child('./wire-child.mjs', { WIRE_CHILD_CONFIG: JSON.stringify({ path: '/tmp/atram-unit-absent.sock', binding: binding(), timeoutMs: 1000, lateWindowMs: 3000 }) }, log).ready(); let status = 'FAILED', error; try {
    await child.signal('SIGSTOP');
    assert.ok(log.some(x => x.event === 'PROCESS_STOP_CONFIRMED'));
    await child.signal('SIGCONT');
    await child.signal('SIGKILL');
    status = 'PASSED';
}
catch (e) {
    error = e.code ?? 'PROCESS_STATE_UNVERIFIED';
    throw e;
}
finally {
    await child.close();
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir('test-results/7b4c', { recursive: true });
    await writeFile('test-results/7b4c/U18-process-control.json', JSON.stringify({ status, error, scope: 'PROCESS_CONTROL_ONLY_NO_POSTGRESQL_OR_CREATE', log }, null, 2));
} });
