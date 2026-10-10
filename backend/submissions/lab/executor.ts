import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { Principal } from '../../auth/service.ts';
import { BackendError } from '../../security/errors.ts';
import type { Decision, LabProof } from '../contracts.ts';
import { SubmissionRepository } from '../repository.ts';
import { LabAttestor } from './observer.ts';
import { classify } from './evidence-policy.ts';
import { publicBinding, type SyntheticTransport, type Observation } from './contracts.ts';
export type Barrier = 'INTENT_ACKED' | 'VALIDATED' | 'CAPABILITY_CONSUMED' | 'TRANSPORT_INVOKED' | 'OBSERVATION' | 'EVIDENCE_COMMITTED' | 'CAPABILITY_CLOSED';
export interface LabHooks {
    barrier?: (name: Barrier, data: Record<string, unknown>) => Promise<void>;
}
// Private to the module, one PID, no serialization/IPC/transfer/reconstruction.
class Capability {
    #state: 'UNUSED' | 'CONSUMED' | 'CLOSED' = 'UNUSED';
    readonly pid = process.pid;
    consume() { if (this.pid !== process.pid || this.#state !== 'UNUSED')
        throw Error('LAB_CAPABILITY_UNAVAILABLE'); this.#state = 'CONSUMED'; }
    closeUnused() { if (this.pid !== process.pid || this.#state !== 'UNUSED')
        return false; this.#state = 'CLOSED'; return true; }
}
export class LabExecutor {
    readonly repo: SubmissionRepository;
    readonly attestor: LabAttestor;
    constructor(repo: SubmissionRepository, attestor: LabAttestor) { this.repo = repo; this.attestor = attestor; }
    async execute(p: Principal, input: Decision, transport: SyntheticTransport, hooks: LabHooks = {}) {
        const barrier = async (name: Barrier, data: Record<string, unknown> = {}) => { await hooks.barrier?.(name, { operationId: receipt.commandReceipt.operationId, executionId: receipt.commandReceipt.executionId, ...data }); };
        // No middleware retries this call or this block. An uncertain ACK escapes without
        // minting a capability, even if the database actually committed the intention.
        const authorizedEpoch = await this.repo.recovery.assertOpen();
        const receipt = await this.repo.confirm(p, input);
        if (receipt.replay || receipt.commandReceipt.result !== 'RECORDED')
            return { receipt, dispatched: false };
        const { operationId, executionId } = receipt.commandReceipt;
        if (!operationId || !executionId)
            throw Error('LAB_INTENT_REQUIRED');
        const cap = new Capability();
        let prepared = false;
        try {
            await barrier('INTENT_ACKED');
            // Never adopt a new NORMAL epoch after the intention ACK (e.g. a restore).
            await this.repo.recovery.assertSame(authorizedEpoch);
            const binding = await this.repo.validateLabDispatch(p, input, operationId, executionId, authorizedEpoch);
            const expires = binding.expiresMonotonicMs;
            await barrier('VALIDATED');
            await this.repo.recovery.assertSame(authorizedEpoch);
            if (performance.now() >= expires)
                throw new BackendError('LEASE_EXPIRED', 503);
            cap.consume();
            prepared = true;
            // C13 intentionally pauses HERE: after all checks, before invocation. An old
            // process can still cause one effect; potentialEffect forbids any replacement.
            await barrier('CAPABILITY_CONSUMED');
            await barrier('TRANSPORT_INVOKED');
            for await (const observation of transport.observe(binding)) {
                await barrier('OBSERVATION', { type: observation.type });
                let proof: LabProof;
                try {
                    proof = classify(publicBinding(binding), observation);
                }
                catch {
                    // A rejected response is not a negative proof. Persist only sanitized
                    // INCONCLUSIVE, not the invalid caller-chosen binding/body.
                    proof = classify(publicBinding(binding), { type: 'uncertain', reason: 'INVALID_RESPONSE' });
                }
                const evidenceCommandId = randomUUID();
                // If persistence fails, expose proof/identity only to trusted test supervisor.
                // No success, no CREATE retry. Caller may retry this SAME local observation.
                try {
                    await this.attestor.record(input, proof, evidenceCommandId);
                }
                catch (error) {
                    return { receipt, dispatched: true, pending: { proof, commandId: evidenceCommandId }, error: error instanceof BackendError ? error.code : 'LEDGER_UNAVAILABLE' };
                }
                await barrier('EVIDENCE_COMMITTED', { evidenceId: proof.evidenceId, kind: proof.kind });
            }
            return { receipt, dispatched: true };
        }
        catch (error) {
            if (prepared)
                throw error; // Never claim NO_EFFECT after the capability was consumed.
            const closed = cap.closeUnused();
            await barrier('CAPABILITY_CLOSED', { closed, transportNotInvoked: true });
            // 503/lease/hold/storage errors remain conservatively pending for the observer.
            // A controlled pre-invocation fault or authorization denial has a closed local
            // owner path. No deferred callback or transport task exists on this branch.
            if (closed && (!(error instanceof BackendError) || error.status < 500)) {
                const stored = await this.attestor.repo.read(this.attestor.principal, input.orderId, input.submissionId), s = stored.projection.submission;
                if (!s)
                    throw error;
                const proof: LabProof = { evidenceId: randomUUID(), operationId, executionId, source: 'LAB_ATTESTATION', businessHash: s.businessHash, requestHash: s.requestHash, account: s.account, generation: 1, kind: 'NO_EFFECT', transportNotInvoked: true, executionFenced: true, details: JSON.stringify({ producer: 'LAB_EXECUTOR', mechanism: 'OWNER_PATH_CLOSED_BEFORE_CAPABILITY_CONSUMPTION', pid: process.pid, operationId, executionId }) };
                await this.attestor.record(input, proof);
            }
            return { receipt, dispatched: false, error: error instanceof BackendError ? error.code : 'PRE_INVOCATION_FAULT' };
        }
    }
}
export const emptyObservation: Observation = { type: 'uncertain', reason: 'INVALID_RESPONSE' };
