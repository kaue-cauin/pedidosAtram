import type { Customer, Order, PriceList, Product, Seller } from '../types/order';

/** Boundary reserved for stage 5. Stage 1 does not instantiate an ERP provider. */
export interface ERPProvider {
  getProducts(): Promise<readonly Product[]>;
  getCustomers(): Promise<readonly Customer[]>;
  getSellers(): Promise<readonly Seller[]>;
  getPriceLists(): Promise<readonly PriceList[]>;
  validateOrder(order: Order): Promise<{ valid: boolean; errors: readonly string[] }>;
  createOrder(order: Order, submissionId: string): Promise<{ erpOrderId: string }>;
}
