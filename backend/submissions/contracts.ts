import { z } from 'zod';
import { submissionPayload, validateSubmission } from '../../domain/submission.ts';
import type { Order } from '../../types/order.ts';
import { hash } from '../security/crypto.ts';
import { fail } from '../security/errors.ts';
export const CONTRACT = 'submission-ledger-v1';
export const CANONICAL = 'legacy-order-canonical-v1';
export const MAPPER = 'fixture-identity-v1';
export const MAX_BYTES = 1024 * 1024;
const short = z.string().max(512), id = z.string().min(1).max(128);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const basis = z.number().int().min(0).max(10000);
const weight = z.number().finite().nonnegative().max(1e9);
const item = z.object({ id, productId:id, code:short, name:short, brand:short, unit:z.string().min(1).max(32), quantity:z.number().finite().positive().max(1e9), unitPriceCents:money, discountBasisPoints:basis, grossWeightGrams:weight, netWeightGrams:weight }).strict();
export const businessSchema = z.object({
  orderId:id, customerId:id, sellerId:id, operation:short, number:short, priceListId:id,
  saleDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), deliveryDate:z.string().max(10), shippingDate:z.string().max(10),
  warehouse:short, intermediary:short, customerFreightCents:money, companyFreightCents:money, expensesCents:money, generalDiscountBasisPoints:basis,
  items:z.array(item).min(1).max(300),
  payment:z.object({method:short,channel:short,bank:short,category:short,terms:short}).strict(),
  shipping:z.object({method:short,freightType:short,trackingCode:short,trackingUrl:short,payer:short,carrier:short,volumes:z.number().int().min(0).max(1e6),sendToDispatch:z.boolean()}).strict(),
  notes:z.string().max(16384),internalNotes:z.string().max(16384),
}).strict();
export function validateBytes(bytes:string, expectedHash:string) {
  if(typeof bytes!=='string'||Buffer.byteLength(bytes)>MAX_BYTES) fail('PAYLOAD_LIMIT',413);
  let value: unknown; try {value=JSON.parse(bytes);} catch {fail('INPUT_INVALID',422);}
  const parsed=businessSchema.safeParse(value);
  if(!parsed.success) fail('INPUT_INVALID',422);
  const order={...parsed.data,status:'DRAFT',submissionId:null} as Order;
  if(validateSubmission(order).length || submissionPayload(order)!==bytes || hash(bytes)!==expectedHash || new Set(order.items.map(i=>i.id)).size!==order.items.length) fail('INPUT_INVALID',422);
  // JS lone surrogates do not round-trip through UTF-8. Reject instead of silently changing bytes.
  if(Buffer.from(bytes,'utf8').toString('utf8')!==bytes) fail('INPUT_INVALID',422);
  return parsed.data;
}
export const commandIdSchema=z.string().uuid();
export type State='READY'|'SUBMITTING'|'SUBMITTED'|'ERROR'|'UNKNOWN';
export type Certainty='NO_EFFECT'|'REJECTED_FINAL'|'ACCEPTED'|'INCONCLUSIVE'|'CONFLICT';
export interface Admission {commandId:string; orderId:string; submissionId:string; expectedOrderRevision:number; sourceLocalRevision:number; canonicalVersion:typeof CANONICAL; bytes:string; businessHash:string}
export interface Decision {commandId:string; orderId:string; submissionId:string; expectedLedgerRevision:number}
export interface LabProof {
  evidenceId:string; operationId:string; executionId:string; source:'LAB_ATTESTATION';
  businessHash:string; requestHash:string; account:string; generation:number;
  kind:'ACCEPTED'|'REJECTED_FINAL'|'NO_EFFECT'|'INCONCLUSIVE';
  externalId?:string; transportNotInvoked?:boolean; executionFenced?:boolean;
  rejectsPastAndFuture?:boolean; contentRejected?:boolean; details:string;
}
export interface Projection {
  orderId:string; orderRevision:number; anchorRevision:number; ownerId:string;
  currentSubmissionId:string|null; acceptedSubmissionId:string|null; conflictHold:boolean; recoveryHold:boolean;
  submission: null|{submissionId:string;state:State;certainty:Certainty;ledgerRevision:number;businessHash:string;requestHash:string;account:string;generation:number;releasedAt:string|null;externalId:string|null;conflictHold:boolean};
}
export interface Receipt {commandId:string; action:string; orderId:string; submissionId?:string; operationId?:string; executionId?:string; evidenceId?:string; result:string}
export interface CommandResult {commandReceipt:Receipt; projection:Projection; replay:boolean}
