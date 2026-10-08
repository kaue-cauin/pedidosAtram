import type { Customer, Order, PriceList, Product, Seller } from '../types/order';
export interface ERPReceipt { submissionId: string; orderId: string; erpOrderId: string; payload: string }
export interface ERPProvider {
  getProducts(): Promise<readonly Product[]>;
  getCustomers(): Promise<readonly Customer[]>;
  getSellers(): Promise<readonly Seller[]>;
  getPriceLists(): Promise<readonly PriceList[]>;
  validateOrder(order: Order): Promise<{ valid: boolean; errors: readonly string[] }>;
  // A production provider MUST atomically bind both identity and immutable payload.
  createOrder(order: Order, submissionId: string): Promise<ERPReceipt>;
  findSubmission(submissionId: string): Promise<ERPReceipt | null>;
}
export class ERPFailure extends Error {
  readonly certainty: 'rejected' | 'unknown';
  readonly retryAfterMs: number;
  constructor(message: string, certainty: 'rejected' | 'unknown', retryAfterMs = 0) {
    super(message); this.certainty = certainty; this.retryAfterMs = retryAfterMs;
  }
}
