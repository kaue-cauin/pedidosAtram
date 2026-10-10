// U tests exercise policy, process-local control and real Unix sockets/signals.
// The coordinator double is explicitly NOT PostgreSQL or durable-ledger evidence.
import '../stage7b4b/no-network.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { classify } from '../../submissions/lab/evidence-policy.ts';
import { publicBinding } from '../../submissions/lab/contracts.ts';
import { LabExecutor } from '../../submissions/lab/executor.ts';
import { LabAttestor } from '../../submissions/lab/observer.ts';
import { BackendError } from '../../security/errors.ts';
function binding() { return { version: 1, organizationId: randomUUID(), orderId: randomUUID(), submissionId: randomUUID(), operationId: randomUUID(), executionId: randomUUID(), account: 'lab:synthetic', generation: 1, businessHash: 'a'.repeat(64), requestHash: 'b'.repeat(64), mapper: 'fixture-identity-v1', canonical: 'legacy-order-canonical-v1', contract: 'submission-ledger-v1', request: 'synthetic', remainingMs: 30000, expiresMonotonicMs: performance.now() + 30000 }; }
const observe = (b, r) => ({ type: 'response', response: { binding: publicBinding(b), ...r } });
function double() { const b = binding(), proofs = [], calls = { confirm: 0, validate: 0, I: 0 }; let confirmed = false; const repo = { recovery: { async assertOpen() { return 'epoch'; }, async assertSame() { } }, async confirm() { calls.confirm++; const replay = confirmed; confirmed = true; return { replay, commandReceipt: { result: 'RECORDED', operationId: b.operationId, executionId: b.executionId } }; }, async validateLabDispatch() { calls.validate++; return b; }, async read() { return { projection: { submission: { businessHash: b.businessHash, requestHash: b.requestHash, account: b.account } } }; }, async recordLabEvidence(p, input, proof) { proofs.push({ p, input, proof }); return {}; } }; const admin = { role: 'ADMIN' }, attestor = new LabAttestor(repo, admin), executor = new LabExecutor(repo, attestor), transport = { async *observe() { calls.I++; yield observe(b, { status: 200, kind: 'ACCEPTED', externalId: 'synthetic' }); } }; return { b, proofs, calls, repo, attestor, executor, transport }; }
test('U01 accepted requires complete exact binding', () => {
    const b = binding();
    assert.equal(classify(publicBinding(b), observe(b, { status: 200, kind: 'ACCEPTED', externalId: 'synthetic' })).kind, 'ACCEPTED');
    for (const k of ['organizationId', 'orderId', 'submissionId', 'operationId', 'executionId', 'account', 'businessHash', 'requestHash']) {
        const other = { ...b, [k]: k.endsWith('Hash') ? 'c'.repeat(64) : randomUUID() };
        assert.throws(() => classify(publicBinding(b), observe(other, { status: 200, kind: 'ACCEPTED', externalId: 'forged' })));
    }
});
test('U02 timeout, close and empty response cannot establish NO_EFFECT', () => {
    const b = binding();
    for (const reason of ['TRANSPORT_TIMEOUT', 'TRANSPORT_CLOSED', 'INVALID_RESPONSE'])
        assert.equal(classify(publicBinding(b), { type: 'uncertain', reason }).kind, 'INCONCLUSIVE');
    assert.throws(() => classify(publicBinding(b), { type: 'response', response: null }));
});
test('U03 status 500, 400 and 200 without ID are inconclusive', () => {
    const b = binding();
    for (const status of [500, 400, 429, 200])
        assert.equal(classify(publicBinding(b), observe(b, { status, kind: 'ACCEPTED' })).kind, 'INCONCLUSIVE');
});
test('U04 controlled rejection requires tombstone and exact key', () => { const b = binding(), t = { id: randomUUID(), submissionId: b.submissionId, pastEffects: 0, futureDeliveriesBlocked: true }; assert.equal(classify(publicBinding(b), observe(b, { status: 400, kind: 'REJECTED_FINAL', tombstone: t })).kind, 'REJECTED_FINAL'); assert.equal(classify(publicBinding(b), observe(b, { status: 400, kind: 'REJECTED_FINAL', tombstone: { ...t, submissionId: randomUUID() } })).kind, 'INCONCLUSIVE'); assert.throws(() => classify(publicBinding(b), observe(b, { status: 400, kind: 'REJECTED_FINAL', tombstone: { ...t, pastEffects: 1 } }))); });
test('U05 ADMIN observer exposes no confirm or execute', () => { const f = double(); assert.equal(f.attestor.confirm, undefined); assert.equal(f.attestor.execute, undefined); assert.throws(() => new LabAttestor(f.repo, { role: 'OPERADOR' })); });
test('U06 1000 replays do not reconstruct capability (coordinator double)', async () => {
    const f = double();
    await f.executor.execute({}, {}, f.transport);
    for (let i = 0; i < 1000; i++)
        assert.equal((await f.executor.execute({}, {}, f.transport)).dispatched, false);
    assert.deepEqual([f.calls.I, f.calls.validate, f.proofs.length], [1, 1, 1]);
});
test('U07 lost ACK never mints a capability (injected adapter)', async () => { const f = double(); f.repo.confirm = async () => { throw new BackendError('LEDGER_UNAVAILABLE', 503); }; await assert.rejects(f.executor.execute({}, {}, f.transport)); assert.deepEqual([f.calls.I, f.proofs.length], [0, 0]); });
test('U08 controlled pre-invocation failure closes owner path', async () => {
    const f = double(), barriers = [];
    const result = await f.executor.execute({}, {}, f.transport, { async barrier(name, data) {
            barriers.push({ name, ...data });
            if (name === 'INTENT_ACKED')
                throw Error('controlled');
        } });
    assert.equal(result.dispatched, false);
    assert.equal(f.calls.I, 0);
    assert.equal(f.proofs[0].proof.kind, 'NO_EFFECT');
    assert.ok(barriers.some(x => x.name === 'CAPABILITY_CLOSED' && x.closed));
    assert.equal((await f.executor.execute({}, {}, f.transport)).dispatched, false);
});
test('U09 failure after consumption never creates negative proof', async () => {
    const f = double();
    await assert.rejects(f.executor.execute({}, {}, f.transport, { async barrier(name) {
            if (name === 'CAPABILITY_CONSUMED')
                throw Error('controlled');
        } }));
    assert.deepEqual([f.calls.I, f.proofs.length], [0, 0]);
});
test('U10 hold/lease/storage errors before invocation stay pending', async () => {
    for (const code of ['RECOVERY_HOLD', 'LEASE_EXPIRED', 'LEDGER_UNAVAILABLE']) {
        const f = double();
        f.repo.validateLabDispatch = async () => { throw new BackendError(code, 503); };
        const r = await f.executor.execute({}, {}, f.transport);
        assert.equal(r.dispatched, false);
        assert.deepEqual([f.calls.I, f.proofs.length], [0, 0]);
    }
});
test('U11 elapsed validation/commit time is not added to lease', async () => { const f = double(); f.b.expiresMonotonicMs = performance.now() - 1; assert.equal((await f.executor.execute({}, {}, f.transport)).error, 'LEASE_EXPIRED'); assert.deepEqual([f.calls.I, f.proofs.length], [0, 0]); });
test('U12 evidence failure returns stable local proof without retrying transport', async () => { const f = double(); f.repo.recordLabEvidence = async () => { throw new BackendError('LEDGER_UNAVAILABLE', 503); }; const r = await f.executor.execute({}, {}, f.transport); assert.equal(r.error, 'LEDGER_UNAVAILABLE'); assert.equal(r.pending.proof.kind, 'ACCEPTED'); assert.match(r.pending.commandId, /^[a-f0-9-]+$/); assert.equal(f.calls.I, 1); assert.equal((await f.executor.execute({}, {}, f.transport)).dispatched, false); });
test('U13 invalid response becomes sanitized INCONCLUSIVE', async () => { const f = double(); f.transport = { async *observe() { f.calls.I++; yield { type: 'response', response: { binding: publicBinding({ ...f.b, account: 'foreign' }), status: 200, kind: 'ACCEPTED', externalId: 'forged' } }; } }; await f.executor.execute({}, {}, f.transport); assert.equal(f.proofs[0].proof.kind, 'INCONCLUSIVE'); assert.ok(!f.proofs[0].proof.details.includes('foreign')); });
test('U14 residual window remains visible after last check (coordinator double)', async () => {
    const f = double();
    await f.executor.execute({}, {}, f.transport, { async barrier(name) {
            if (name === 'CAPABILITY_CONSUMED') {
                f.b.expiresMonotonicMs = performance.now() - 1;
                f.repo.recovery.assertSame = async () => { throw new BackendError('RECOVERY_HOLD', 503); };
            }
        } });
    assert.equal(f.calls.I, 1);
    assert.equal((await f.executor.execute({}, {}, f.transport)).dispatched, false);
});
test('U19 epoch change during intention ACK cannot be silently adopted', async () => {
    const f = double();
    let epoch = 'authorized';
    f.repo.recovery.assertOpen = async () => epoch;
    f.repo.recovery.assertSame = async (expected) => {
        if (expected !== epoch)
            throw new BackendError('RECOVERY_HOLD', 503);
    };
    const original = f.repo.confirm;
    f.repo.confirm = async () => { const r = await original(); epoch = 'new-normal'; return r; };
    const r = await f.executor.execute({}, {}, f.transport);
    assert.equal(r.error, 'RECOVERY_HOLD');
    assert.deepEqual([f.calls.I, f.calls.validate, f.proofs.length], [0, 0, 0]);
});
// Independent child with no PostgreSQL/socket use. Confirms environment boundary and exit only.
test('U20 executor children do not inherit privileged database credentials; SIGKILL exit observed', async () => {
    const { Child } = await import('./harness.mjs');
    const originalApp = process.env.BACKEND_TEST_DATABASE_URL, originalSim = process.env.SIM_TEST_DATABASE_URL;
    const log = [];
    let child;
    try {
        process.env.BACKEND_TEST_DATABASE_URL = 'synthetic-privileged-app-sentinel';
        process.env.SIM_TEST_DATABASE_URL = 'synthetic-privileged-sim-sentinel';
        child = await new Child('./wire-child.mjs', { WIRE_CHILD_CONFIG: JSON.stringify({ path: '/tmp/atram-unused.sock', binding: binding(), timeoutMs: 1000, lateWindowMs: 3000 }) }, log).ready();
        assert.equal(child.messages.find(m => m.ready).privilegedEnvironmentPresent, false);
        await child.signal('SIGKILL');
        assert.ok(log.some(m => m.event === 'PROCESS_EXIT' && m.signal === 'SIGKILL'));
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir('test-results/7b4c', { recursive: true });
        await writeFile('test-results/7b4c/U20-process-isolation.json', JSON.stringify({ status: 'PASSED', scope: 'ENVIRONMENT_BOUNDARY_AND_EXIT_ONLY_NO_POSTGRESQL_OR_CREATE', log }, null, 2));
    }
    finally {
        if (child)
            await child.close();
        if (originalApp === undefined)
            delete process.env.BACKEND_TEST_DATABASE_URL;
        else
            process.env.BACKEND_TEST_DATABASE_URL = originalApp;
        if (originalSim === undefined)
            delete process.env.SIM_TEST_DATABASE_URL;
        else
            process.env.SIM_TEST_DATABASE_URL = originalSim;
    }
});
test('U21 packet budget preserves maximum frozen bytes through two JSON escaping layers', async()=>{
 const {MAX_WIRE_BYTES}=await import('../../submissions/lab/contracts.ts');
 const {MAX_BYTES}=await import('../../submissions/contracts.ts');
 const b=binding(),business='\\'.repeat(MAX_BYTES),request=JSON.stringify({mapper:b.mapper,account:b.account,business});
 const packet=JSON.stringify({binding:publicBinding(b),request})+'\n';
 assert.ok(Buffer.byteLength(packet)>MAX_BYTES);
 assert.ok(Buffer.byteLength(packet)<=MAX_WIRE_BYTES);
 assert.equal(JSON.parse(JSON.parse(packet).request).business,business);
});
