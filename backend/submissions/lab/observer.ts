import { randomUUID } from 'node:crypto';
import type { Principal } from '../../auth/service.ts';
import type { Decision, LabProof } from '../contracts.ts';
import { SubmissionRepository } from '../repository.ts';
export class LabAttestor {
    readonly repo: SubmissionRepository;
    readonly principal: Principal;
    constructor(repo: SubmissionRepository, principal: Principal) { if (principal.role !== 'ADMIN')
        throw Error('LAB_ADMIN_REQUIRED'); this.repo = repo; this.principal = principal; }
    async record(input: Decision, proof: LabProof, commandId = randomUUID()) {
        // IDs passed to record must be retained by caller when retrying LOCAL persistence.
        return this.repo.recordLabEvidence(this.principal, { ...input, commandId }, proof);
    }
    async abandon(input: Decision) {
        const stored = await this.repo.read(this.principal, input.orderId, input.submissionId), s = stored.projection.submission;
        if (s?.state !== 'SUBMITTING')
            return stored.projection;
        return this.repo.abandon(this.principal, { ...input, commandId: randomUUID(), expectedLedgerRevision: s.ledgerRevision });
    }
}
