import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from '../../security/crypto.ts';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './harness.mjs';
import { stopDatabase, startDatabase, dump, restore, checkInfrastructure } from './control.mjs';
import { database } from '../../db/client.ts';
import { SubmissionRepository } from '../../submissions/repository.ts';
import { publicBinding } from '../../submissions/lab/contracts.ts';
import { classify } from '../../submissions/lab/evidence-policy.ts';
import { UnixSyntheticTransport } from '../../submissions/lab/transport.ts';
import { PostgreSQLERPLedger } from './postgresql-erp-ledger.ts';
const id = randomUUID;
await checkInfrastructure(); // No skips/pass surrogate when real infrastructure is missing.
function scenario(n, fn, profiles = [false, true]) { test('C' + String(n).padStart(2, '0'), { timeout: 180000 }, async () => { for (const idempotent of profiles) {
    const f = await fixture();
    const label = 'C' + String(n).padStart(2, '0') + '-' + (idempotent ? 'idempotent' : 'non-idempotent');
    let error;
    try {
        await fn(f, idempotent);
        await f.manifest(label, 'PASSED');
    }
    catch (e) {
        error = e;
        await f.manifest(label, 'FAILED', e);
        throw e;
    }
    finally {
        for (const kind of ['app', 'sim']) {
            const stops = f.log.filter(x => x.kind === kind && x.event === 'DATABASE_STOPPED').length, starts = f.log.filter(x => x.kind === kind && x.event === 'DATABASE_RESTARTED').length;
            if (stops > starts)
                await startDatabase(kind, f.log);
        }
        await f.cleanup();
        if (error)
            console.error(label + ' failed; inspect its sanitized manifest');
    }
} }); }
async function launch(f, idempotent, options = {}, workerOptions = {}) { const a = await f.setup(), sim = await f.simulator({ idempotent, ...options }), w = await f.worker(a, sim, workerOptions); w.start(); return { a, sim, w }; }
async function normal(f, idempotent, options = {}) { const r = await launch(f, idempotent, options); assert.ok((await r.w.result()).result); return r; }
async function noReplacement(f) { const p = await f.state(); await assert.rejects(f.repo.confirm(f.op, { ...f.active.confirm, commandId: id(), expectedLedgerRevision: p.submission.ledgerRevision }), e => ['OUTCOME_BLOCKED', 'STATE_FORBIDDEN', 'RECOVERY_HOLD'].includes(e.code)); }
async function leaseExpired(f) { await f.db.client `UPDATE submission_communications SET lease_until=clock_timestamp()+interval '100 milliseconds' WHERE submission_id=${f.active.input.submissionId}`; let expired = false; for (let n = 0; n < 100; n++) {
    const [r] = await f.db.client `SELECT lease_until<clock_timestamp() expired FROM submission_communications WHERE submission_id=${f.active.input.submissionId}`;
    if (r.expired) {
        expired = true;
        break;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
} assert.equal(expired, true); f.log.push({ event: 'LEASE_EXPIRATION_CONFIRMED', fixtureDurationInjectedMs: 100, clock: 'POSTGRESQL_CLOCK_TIMESTAMP' }); }
async function direct(f, sim, b) { f.log.push({ event: 'HARNESS_AUXILIARY_CREATE' }); const observations = []; for await (const o of new UnixSyntheticTransport(sim.path).observe(b))
    observations.push(o); return observations; }
scenario(1, async (f, mode) => { await normal(f, mode); await f.assertCounts([1, 1, 1, 1, 2, 1]); assert.equal((await f.state()).submission.state, 'SUBMITTED'); });
scenario(2, async (f, mode) => { const a = await f.setup(), sim = await f.simulator({ idempotent: mode }), workers = await Promise.all([f.worker(a, sim, { repeat: 50 }), f.worker(a, sim, { repeat: 50 })]); workers.forEach(w => w.start()); for (const w of workers)
    assert.ok((await w.result()).result); await f.assertCounts([1, 1, 1, 1, 2, 1]); });
scenario(3, async (f, mode) => { const { a, sim } = await normal(f, mode, { profile: 'lost' }); const workers = await Promise.all([f.worker(a, sim, { repeat: 500 }), f.worker(a, sim, { repeat: 500 })]); workers.forEach(w => w.start()); for (const w of workers)
    assert.equal((await w.result()).result.dispatched, false); await noReplacement(f); await f.assertCounts([1, 1, 1, 1, 2, 1]); assert.equal((await f.state()).submission.state, 'UNKNOWN'); });
scenario(4, async (f, mode) => { const { w } = await launch(f, mode, {}, { fault: 'BEFORE_COMMIT' }); assert.equal((await w.result()).error, 'LEDGER_UNAVAILABLE'); await f.assertCounts([0, 0, 0, 0, 0, 0]); assert.equal((await f.state()).submission.state, 'READY'); });
scenario(5, async (f, mode) => { const { a, w } = await launch(f, mode, {}, { fault: 'LOST_ACK' }); assert.equal((await w.result()).error, 'LEDGER_UNAVAILABLE'); await f.attestor.abandon(a.confirm); await noReplacement(f); await f.assertCounts([0, 0, 0, 1, 2, 0]); });
scenario(6, async (f, mode) => { const { w } = await launch(f, mode, {}, { fault: 'INTENT_ACKED' }); assert.equal((await w.result()).result.dispatched, false); assert.ok(w.messages.some(m => m.barrier === 'CAPABILITY_CLOSED' && m.closed === true)); assert.equal(w.exited.code, 0); await f.assertCounts([0, 0, 0, 1, 2, 1]); assert.equal((await f.state()).submission.certainty, 'NO_EFFECT'); });
scenario(7, async (f) => { const a = await f.setup(), w = await f.worker(a, { path: join(f.dir, 'absent.sock') }); w.start(); assert.ok((await w.result()).result); await f.assertCounts([1, 0, 0, 1, 2, 1]); await noReplacement(f); });
scenario(8, async (f, mode) => { await normal(f, mode, { profile: 'lost' }); await noReplacement(f); await f.assertCounts([1, 1, 1, 1, 2, 1]); });
scenario(9, async (f, mode) => { const { a, sim, w } = await launch(f, mode, {}, { pause: 'OBSERVATION' }); await sim.child.barrier('SIM_EFFECT_COMMITTED'); await w.barrier('OBSERVATION'); await w.signal('SIGKILL'); await f.attestor.abandon(a.confirm); const reboot = await f.worker(a, sim); reboot.start(); assert.equal((await reboot.result()).result.dispatched, false); await f.assertCounts([1, 1, 1, 1, 2, 0]); await noReplacement(f); });
scenario(10, async (f, mode) => { const { w } = await launch(f, mode, { profile: 'delay', delayMs: 300 }, { timeoutMs: 50, lateWindowMs: 1000 }); assert.ok((await w.result()).result); await f.assertCounts([1, 1, 1, 1, 3, 2]); assert.deepEqual(f.log.filter(x => x.barrier === 'EVIDENCE_COMMITTED').map(x => x.kind), ['INCONCLUSIVE', 'ACCEPTED']); assert.equal((await f.state()).submission.state, 'SUBMITTED'); });
scenario(11, async (f, mode) => { const { a } = await normal(f, mode), b = publicBinding(await f.binding()), original = (await f.state()).submission.externalId; await f.attestor.record(a.confirm, classify(b, { type: 'uncertain', reason: 'INVALID_RESPONSE' })); const p = await f.state(); assert.equal(p.submission.state, 'SUBMITTED'); assert.equal(p.submission.externalId, original); assert.equal(p.conflictHold, true); await f.assertCounts([1, 1, 1, 1, 3, 2]); await noReplacement(f); });
scenario(12, async (f, mode) => { const { a, w } = await launch(f, mode, {}, { pause: 'INTENT_ACKED' }), barrier = await w.barrier('INTENT_ACKED'); await w.signal('SIGSTOP'); await leaseExpired(f); await f.attestor.abandon(a.confirm); await noReplacement(f); await w.signal('SIGCONT'); w.release(barrier); assert.equal((await w.result()).result.dispatched, false); await f.assertCounts([0, 0, 0, 1, 2, 0]); });
scenario(13, async (f, mode) => { const { a, w } = await launch(f, mode, {}, { pause: 'CAPABILITY_CONSUMED' }), barrier = await w.barrier('CAPABILITY_CONSUMED'); await w.signal('SIGSTOP'); await leaseExpired(f); await f.attestor.abandon(a.confirm); await noReplacement(f); await w.signal('SIGCONT'); w.release(barrier); assert.equal((await w.result()).result.dispatched, true); await f.assertCounts([1, 1, 1, 1, 3, 1]); assert.equal((await f.state()).submission.state, 'SUBMITTED'); });
scenario(14, async (f, mode) => { const a = await f.setup(), sim = await f.simulator({ idempotent: mode }); await stopDatabase('app', f.log); const w = await f.worker(a, sim); w.start(); assert.equal((await w.result()).error, 'LEDGER_UNAVAILABLE'); await startDatabase('app', f.log); await f.assertCounts([0, 0, 0, 0, 0, 0]); assert.equal((await f.state()).submission.state, 'READY'); });
scenario(15, async (f, mode) => { const { a, w } = await launch(f, mode, {}, { pause: 'INTENT_ACKED' }), barrier = await w.barrier('INTENT_ACKED'); await stopDatabase('app', f.log); w.release(barrier); assert.equal((await w.result()).result.dispatched, false); await startDatabase('app', f.log); await f.attestor.abandon(a.confirm); await f.assertCounts([0, 0, 0, 1, 2, 0]); await noReplacement(f); });
scenario(16, async (f, mode) => { const { a, w } = await launch(f, mode, {}, { pause: 'OBSERVATION' }), barrier = await w.barrier('OBSERVATION'); await stopDatabase('app', f.log); w.release(barrier); const r = (await w.result()).result; assert.equal(r.error, 'LEDGER_UNAVAILABLE'); assert.ok(r.pending); await startDatabase('app', f.log); assert.equal((await f.state()).submission.state, 'SUBMITTING'); await f.attestor.abandon(a.confirm); await f.attestor.record(a.confirm, r.pending.proof, r.pending.commandId); await f.attestor.record(a.confirm, r.pending.proof, r.pending.commandId); await f.assertCounts([1, 1, 1, 1, 3, 1]); assert.equal((await f.state()).submission.state, 'SUBMITTED'); });
scenario(17, async (f, mode) => { const { a, sim, w } = await launch(f, mode, {}, { pause: 'INTENT_ACKED' }); await w.barrier('INTENT_ACKED'); await w.signal('SIGKILL'); const reboot = await f.worker(a, sim); reboot.start(); assert.equal((await reboot.result()).result.dispatched, false); await f.attestor.abandon(a.confirm); await f.assertCounts([0, 0, 0, 1, 2, 0]); await noReplacement(f); });
scenario(18, async (f, mode) => { const a = await f.setup(), sim = await f.simulator({ idempotent: mode }); for (let n = 0; n < 2; n++) {
    const w = await f.worker(a, sim, { action: 'read' });
    w.start();
    assert.equal((await w.result()).result.projection.submission.state, 'READY');
} await f.assertCounts([0, 0, 0, 0, 0, 0]); assert.equal((await f.state()).currentSubmissionId, a.input.submissionId); });
scenario(19, async (f, mode) => { const a = await f.setup(), sim = await f.simulator({ idempotent: mode }); for (const value of [JSON.stringify({ ...f.open, state: 'RECOVERY_HOLD' }), 'invalid', null]) {
    if (value === null)
        await rm(f.gatePath);
    else
        await writeFile(f.gatePath, value);
    const w = await f.worker(a, sim);
    w.start();
    assert.equal((await w.result()).error, 'RECOVERY_HOLD');
} await f.assertCounts([0, 0, 0, 0, 0, 0]); });
async function gateChanged(f, mode, state) { const { a, w } = await launch(f, mode, {}, { pause: 'VALIDATED' }), b = await w.barrier('VALIDATED'); await writeFile(f.gatePath, JSON.stringify({ ...f.open, state, epoch: id() })); w.release(b); assert.equal((await w.result()).result.dispatched, false); await f.attestor.abandon(a.confirm); await f.assertCounts([0, 0, 0, 1, 2, 0]); }
scenario(20, async (f, mode) => { await gateChanged(f, mode, 'RECOVERY_HOLD'); assert.equal(await f.gate.assertOpen().catch(e => e.code), 'RECOVERY_HOLD'); const g = await fixture(); try {
    await gateChanged(g, mode, 'NORMAL');
    await g.manifest('C20-normal-epoch-' + mode, 'PASSED');
}
catch (e) {
    await g.manifest('C20-normal-epoch-' + mode, 'FAILED', e);
    throw e;
}
finally {
    await g.cleanup();
} });
scenario(21, async (f, mode) => { const a = await f.setup(), file = join(f.dir, 'ready.dump'); await dump(f.url, file); const sim = await f.simulator({ idempotent: mode }), w = await f.worker(a, sim, { pause: 'OBSERVATION' }); w.start(); await w.barrier('OBSERVATION'); await f.assertCounts([1, 1, 1, 1, 1, 0]); await w.signal('SIGKILL'); await sim.child.close(); await writeFile(f.gatePath, JSON.stringify({ ...f.open, state: 'RECOVERY_HOLD', windowStart: 'backup', windowEnd: 'restore' })); f.log.push({ event: 'QUIESCED_AND_EXTERNAL_HOLD' }); await f.runtime.close(); await restore(f.url, file); f.log.push({ event: 'LEDGER_RESTORED', before: [1, 1, 1, 1, 1, 0] }); const db = database(f.runtimeUrl), repo = new SubmissionRepository(db, f.protection, f.gate); try {
    assert.equal((await repo.read(f.op, a.orderId, a.input.submissionId)).projection.submission.state, 'READY');
    await assert.rejects(repo.confirm(f.op, a.confirm), e => e.code === 'RECOVERY_HOLD');
    await f.assertCounts([1, 1, 1, 0, 0, 0]);
}
finally {
    await db.close();
} });
async function revoked(f, mode, membership) { const { w } = await launch(f, mode, {}, { pause: 'INTENT_ACKED' }), b = await w.barrier('INTENT_ACKED'); if (membership)
    await f.db.client `UPDATE organization_memberships SET status='INACTIVE' WHERE organization_id=${f.op.organizationId} AND user_id=${f.op.userId}`;
else
    await f.db.client `UPDATE sessions SET revoked_at=clock_timestamp() WHERE id=${f.op.sessionId}`; w.release(b); assert.equal((await w.result()).result.dispatched, false); assert.ok(w.messages.some(x => x.barrier === 'CAPABILITY_CLOSED' && x.closed)); await f.assertCounts([0, 0, 0, 1, 2, 1]); assert.equal((await f.state()).submission.certainty, 'NO_EFFECT'); }
scenario(22, async (f, mode) => { await revoked(f, mode, false); const g = await fixture(); try {
    await revoked(g, mode, true);
    await g.manifest('C22-membership-' + mode, 'PASSED');
}
catch (e) {
    await g.manifest('C22-membership-' + mode, 'FAILED', e);
    throw e;
}
finally {
    await g.cleanup();
} });
scenario(23, async (f, mode) => { const { w } = await launch(f, mode, {}, { pause: 'INTENT_ACKED' }), b = await w.barrier('INTENT_ACKED'), p = await f.state(); await f.repo.owner(f.admin, { commandId: id(), orderId: f.active.orderId, ownerId: f.op2.userId, expectedAnchorRevision: p.anchorRevision, reason: 'Synthetic ownership transfer' }); w.release(b); assert.equal((await w.result()).result.dispatched, false); await f.assertCounts([0, 0, 0, 1, 3, 1]); assert.equal((await f.state()).submission.certainty, 'NO_EFFECT'); });
scenario(24, async (f, mode) => { const { sim } = await normal(f, mode, { profile: 'reject' }), b = await f.binding(); await sim.child.close(); await stopDatabase('sim', f.log); await startDatabase('sim', f.log); const reboot = await f.simulator({ idempotent: mode }); const o = await direct(f, reboot, b); assert.equal(o.at(-1).response.kind, 'REJECTED_FINAL'); await f.assertCounts([1, 2, 0, 1, 2, 1]); assert.equal((await f.state()).submission.certainty, 'REJECTED_FINAL'); });
scenario(25, async (f, mode) => { await normal(f, mode, { profile: '500-empty' }); await noReplacement(f); await f.assertCounts([1, 1, 0, 1, 2, 1]); for (const profile of ['500-effect', 'invalid', '200-no-id']) {
    const g = await fixture();
    try {
        await normal(g, mode, { profile });
        await noReplacement(g);
        await g.assertCounts([1, 1, 1, 1, 2, 1]);
        await g.manifest('C25-' + profile + '-' + mode, 'PASSED');
    }
    finally {
        await g.cleanup();
    }
} });
scenario(26, async (f) => { const organizationId = f.op.organizationId, business = 'Synthetic calibration only', request = JSON.stringify({ mapper: 'fixture-identity-v1', account: 'lab:' + organizationId, business }), binding = { version: 1, organizationId, orderId: id(), submissionId: id(), operationId: id(), executionId: id(), account: 'lab:' + organizationId, generation: 1, businessHash: hash(business), requestHash: hash(request), mapper: 'fixture-identity-v1', canonical: 'legacy-order-canonical-v1', contract: 'submission-ledger-v1', request, remainingMs: 30000, expiresMonotonicMs: 0 }, sim = await f.simulator({ idempotent: false }); await direct(f, sim, binding); await direct(f, sim, binding); await sim.child.close(); await stopDatabase('sim', f.log); await startDatabase('sim', f.log); await f.simulator({ idempotent: false }); await f.assertCounts([0, 2, 2, 0, 0, 0]); const g = await fixture(); try {
    const idem = await g.simulator({ idempotent: true });
    await direct(g, idem, binding);
    await direct(g, idem, binding);
    await g.assertCounts([0, 2, 1, 0, 0, 0]);
    await g.manifest('C26-idempotent-calibration', 'PASSED');
}
finally {
    await g.cleanup();
} const ledger = new PostgreSQLERPLedger(f.simUrl); try {
    const r = { submissionId: id(), orderId: id(), erpOrderId: 'synthetic', payload: 'synthetic' };
    assert.deepEqual(await ledger.create(r), r);
    assert.deepEqual(await ledger.create({ ...r, erpOrderId: 'ignored' }), r);
    await assert.rejects(ledger.create({ ...r, payload: 'different' }));
}
finally {
    await ledger.close();
} }, [false]);
scenario(27, async (f, mode) => { const { a, sim, w } = await launch(f, mode, {}, { fault: 'INTENT_ACKED' }); await w.result(); const p = await f.state(); a.confirm = { ...a.confirm, commandId: id(), expectedLedgerRevision: p.submission.ledgerRevision }; const next = await f.worker(a, sim); next.start(); assert.ok((await next.result()).result); await f.assertCounts([1, 1, 1, 2, 4, 2]); });
scenario(28, async (f, mode) => { const { a } = await normal(f, mode), binding = publicBinding(await f.binding()), proof = classify(binding, { type: 'response', response: { binding, status: 200, kind: 'ACCEPTED', externalId: (await f.state()).submission.externalId } }); const audit = async () => { const [r] = await f.db.client `SELECT count(*)::int n FROM audit_events WHERE action='SUBMISSION_DENIED'`; return r.n; }; const before = await audit(); for (const key of ['organizationId', 'account', 'businessHash', 'executionId'])
    assert.throws(() => classify(binding, { type: 'response', response: { binding: { ...binding, [key]: key === 'businessHash' ? 'f'.repeat(64) : id() }, status: 200, kind: 'ACCEPTED', externalId: 'forged' } })); await assert.rejects(f.repo.recordLabEvidence(f.admin, { ...a.confirm, commandId: id() }, { ...proof, evidenceId: 'invalid' })); assert.equal(await audit(), before); f.log.push({ event: 'PRETRANSACTION_REJECTIONS', auditDelta: 0 }); let expected = before; for (const patch of [{ executionId: id() }, { account: 'lab:other' }, { businessHash: 'f'.repeat(64) }]) {
    await assert.rejects(f.repo.recordLabEvidence(f.admin, { ...a.confirm, commandId: id() }, { ...proof, evidenceId: id(), ...patch }), e => e.code === 'EVIDENCE_INVALID');
    assert.equal(await audit(), ++expected);
} await assert.rejects(f.repo.recordLabEvidence(f.other, { ...a.confirm, commandId: id() }, { ...proof, evidenceId: id() }), e => e.code === 'RESOURCE_UNAVAILABLE'); assert.equal(await audit(), ++expected); await assert.rejects(f.repo.confirm(f.admin, a.confirm), e => e.code === 'FORBIDDEN'); assert.equal(await audit(), ++expected); f.log.push({ event: 'TRANSACTION_DENIALS', auditDelta: expected - before }); await f.assertCounts([1, 1, 1, 1, 2, 1]); });
scenario(29, async (f, mode) => { const { a, sim } = await normal(f, mode, { profile: 'lost' }); await sim.child.close(); await stopDatabase('sim', f.log); await startDatabase('sim', f.log); const reboot = await f.simulator({ idempotent: mode }), w = await f.worker(a, reboot); w.start(); assert.equal((await w.result()).result.dispatched, false); const b = publicBinding(await f.binding()); assert.throws(() => classify(b, { type: 'response', response: null })); assert.equal(classify(b, { type: 'uncertain', reason: 'INVALID_RESPONSE' }).kind, 'INCONCLUSIVE'); await noReplacement(f); await f.assertCounts([1, 1, 1, 1, 2, 1]); });
