import { z } from 'zod';
import {MAX_BYTES} from '../contracts.ts';
// Business bytes are JSON-escaped once in request and again in the wire packet.
export const MAX_WIRE_BYTES=4*MAX_BYTES+8192;
export const bindingSchema = z.object({ version: z.literal(1), organizationId: z.string().uuid(), orderId: z.string().uuid(), submissionId: z.string().uuid(), operationId: z.string().uuid(), executionId: z.string().uuid(), account: z.string().max(128), generation: z.literal(1), businessHash: z.string().regex(/^[a-f0-9]{64}$/), requestHash: z.string().regex(/^[a-f0-9]{64}$/), mapper: z.literal('fixture-identity-v1'), canonical: z.literal('legacy-order-canonical-v1'), contract: z.literal('submission-ledger-v1') }).strict();
export type Binding = z.infer<typeof bindingSchema>;
export interface DispatchBinding extends Binding {
    request: string;
    remainingMs: number;
    expiresMonotonicMs: number;
}
export const responseSchema = z.object({ binding: bindingSchema, status: z.number().int(), kind: z.enum(['ACCEPTED', 'REJECTED_FINAL', 'INCONCLUSIVE']), externalId: z.string().min(1).max(128).optional(), tombstone: z.object({ id: z.string().uuid(), submissionId: z.string().uuid(), pastEffects: z.literal(0), futureDeliveriesBlocked: z.literal(true) }).strict().optional() }).strict();
export type Response = z.infer<typeof responseSchema>;
export type Observation = {
    type: 'response';
    response: unknown;
} | {
    type: 'uncertain';
    reason: 'TRANSPORT_TIMEOUT' | 'TRANSPORT_CLOSED' | 'INVALID_RESPONSE';
};
export interface SyntheticTransport {
    observe(binding: DispatchBinding): AsyncIterable<Observation>;
}
export function publicBinding(b: DispatchBinding): Binding { const { request, remainingMs, expiresMonotonicMs, ...identity } = b; void request; void remainingMs; void expiresMonotonicMs; return identity; }
export const sameBinding = (a: Binding, b: Binding) => Object.keys(a).every(k => a[k as keyof Binding] === b[k as keyof Binding]);
