import type { Customer, Order, PriceList, Product, Seller, SubmissionFailureKind } from '../types/order';
export interface ERPReceipt { submissionId: string; orderId: string; erpOrderId: string; payload: string }
export interface ERPRejection { submissionId: string; orderId: string; payload: string; rejectedAt: string }
export interface ERPProvider {
  getProducts(): Promise<readonly Product[]>;
  getCustomers(): Promise<readonly Customer[]>;
  getSellers(): Promise<readonly Seller[]>;
  getPriceLists(): Promise<readonly PriceList[]>;
  validateOrder(order: Order): Promise<{ valid: boolean; errors: readonly string[] }>;
  // A production provider MUST atomically bind both identity and immutable payload.
  createOrder(order: Order, submissionId: string): Promise<ERPReceipt>;
  findSubmission(submissionId: string): Promise<ERPReceipt | null>;
  // A definitive content rejection must rule out any late acceptance of that key.
  findRejection(submissionId: string): Promise<ERPRejection | null>;
}
export class ERPFailure extends Error {
  readonly certainty: 'rejected' | 'unknown';
  readonly retryAfterMs: number;
  readonly kind: SubmissionFailureKind;
  constructor(message: string, certainty: 'rejected' | 'unknown', retryAfterMs = 0, kind: SubmissionFailureKind = certainty === 'unknown' ? 'unknown' : 'legacy-rejected') {
    super(message); this.certainty = certainty; this.retryAfterMs = retryAfterMs; this.kind = kind;
  }
}
