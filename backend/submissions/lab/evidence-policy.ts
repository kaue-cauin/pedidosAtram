import { randomUUID } from 'node:crypto';
import { responseSchema, sameBinding, type Binding, type Observation } from './contracts.ts';
import type { LabProof } from '../contracts.ts';
// Only trusted local transport observations reach this policy. The simulator is
// controlled synthetic infrastructure; its protocol does not establish Tiny guarantees.
export function classify(binding: Binding, observation: Observation): LabProof {
    const proof: LabProof = { evidenceId: randomUUID(), operationId: binding.operationId, executionId: binding.executionId, source: 'LAB_ATTESTATION', businessHash: binding.businessHash, requestHash: binding.requestHash, account: binding.account, generation: 1, kind: 'INCONCLUSIVE', details: JSON.stringify({ producer: 'LAB_EXECUTOR', observation: observation.type === 'uncertain' ? observation.reason : 'UNVALIDATED_RESPONSE' }) };
    if (observation.type === 'uncertain')
        return proof;
    const parsed = responseSchema.safeParse(observation.response);
    // Invalid schema/binding is rejected BEFORE any repository transaction/audit.
    if (!parsed.success || !sameBinding(binding, parsed.data.binding))
        throw Error('LAB_RESPONSE_BINDING_INVALID');
    const r = parsed.data;
    if (r.kind === 'ACCEPTED' && r.status === 200 && r.externalId && !r.tombstone) {
        proof.kind = 'ACCEPTED';
        proof.externalId = r.externalId;
    }
    else if (r.kind === 'REJECTED_FINAL' && r.status === 400 && r.tombstone && r.tombstone.submissionId === binding.submissionId && !r.externalId) {
        proof.kind = 'REJECTED_FINAL';
        proof.executionFenced = true;
        proof.rejectsPastAndFuture = true;
        proof.contentRejected = true;
    }
    proof.details = JSON.stringify({ producer: 'LAB_EXECUTOR', status: r.status, kind: proof.kind, tombstone: r.tombstone ?? null });
    return proof;
}
