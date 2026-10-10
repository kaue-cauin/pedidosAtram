import '../stage7b4b/no-network.mjs';
import { database } from '../../db/client.ts';
import { Vault } from '../../security/crypto.ts';
import { SubmissionProtection } from '../../submissions/protection.ts';
import { SubmissionRepository } from '../../submissions/repository.ts';
import { RecoveryGate } from '../../submissions/recovery.ts';
import { LabExecutor } from '../../submissions/lab/executor.ts';
import { LabAttestor } from '../../submissions/lab/observer.ts';
import { UnixSyntheticTransport } from '../../submissions/lab/transport.ts';
import { BackendError } from '../../security/errors.ts';
const c = JSON.parse(process.env.EXEC_WORKER_CONFIG), db = database(c.url);
const repo = new SubmissionRepository(db, new SubmissionProtection(new Vault(new Map([['lab-v1', Buffer.alloc(32, 17)]]), 'lab-v1')), new RecoveryGate(c.gatePath, 'synthetic-lab'));
const attestor = new LabAttestor(repo, c.admin), executor = new LabExecutor(repo, attestor);
if (c.fault === 'BEFORE_COMMIT')
    repo.recovery.assertSame = async () => { throw new BackendError('LEDGER_UNAVAILABLE', 503); };
if (c.fault === 'LOST_ACK') {
    const confirm = repo.confirm.bind(repo);
    repo.confirm = async (...args) => { await confirm(...args); throw new BackendError('LEDGER_UNAVAILABLE', 503); };
}
const paused = new Map();
let seq = 0, started = false;
const barrier = async (name, data) => { const n = ++seq; process.send?.({ barrier: name, n, ...data }); if (c.fault === name)
    throw Error('INJECTED_PRE_INVOCATION_FAULT'); if (c.pause === name)
    await new Promise(resolve => paused.set(n, resolve)); };
const transport = new UnixSyntheticTransport(c.path, c.timeoutMs ?? 1000, c.lateWindowMs ?? 3000, () => process.send?.({ invoked: true }));
process.on('message', async (m) => {
    if (m.release) {
        paused.get(m.release)?.();
        return;
    }
    if (!m.start || started)
        return;
    started = true;
    try {
        let result;
        for (let i = 0; i < (c.repeat ?? 1); i++)
            result = c.action === 'confirm' ? await repo.confirm(c.principal, c.input) : c.action === 'read' ? await repo.read(c.principal, c.input.orderId, c.input.submissionId) : await executor.execute(c.principal, c.input, transport, { barrier });
        process.send?.({ result });
    }
    catch (error) {
        process.send?.({ error: error.code ?? error.message });
    }
    finally {
        await db.close();
        process.disconnect?.();
    }
});
process.send?.({ ready: true, privilegedEnvironmentPresent: Boolean(process.env.BACKEND_TEST_DATABASE_URL || process.env.SIM_TEST_DATABASE_URL) });
