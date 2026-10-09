export type OrderStatus = 'DRAFT' | 'VALIDATING' | 'READY' | 'SUBMITTING' | 'SUBMITTED' | 'ERROR' | 'UNKNOWN';

export interface Product {
  id: string;
  code: string;
  ean: string;
  name: string;
  brand: string;
  unit: string;
  priceCents: number;
  grossWeightGrams: number;
  netWeightGrams: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  taxId: string;
  city: string;
  state: string;
}

export interface Seller { id: string; name: string }
export interface PriceList { id: string; name: string }
export interface OrderItem {
  id: string;
  productId: string;
  code: string;
  name: string;
  brand: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  discountBasisPoints: number;
  grossWeightGrams: number;
  netWeightGrams: number;
}

export type SubmissionFailureKind = 'validation' | 'auth' | 'rate-limit' | 'unknown' | 'not-found' | 'legacy-rejected';
export interface SubmissionEvent { at: string; type: string; submissionId: string; message?: string }
export interface SubmissionHistoryRecord extends SubmissionAttempt { submissionId: string; status: 'REJECTED_VALIDATION'; finishedAt: string }

export interface SubmissionAttempt {
  payload: string;
  startedAt: string;
  erpOrderId?: string;
  message?: string;
  retryAt?: number;
  failureKind?: SubmissionFailureKind;
  finishedAt?: string;
}

export interface Order {
  orderId: string;
  submissionId: string | null;
  status: OrderStatus;
  submission?: SubmissionAttempt;
  submissionHistory?: readonly SubmissionHistoryRecord[];
  submissionEvents?: readonly SubmissionEvent[];
  customerId: string | null;
  sellerId: string;
  operation: string;
  number: string;
  priceListId: string;
  saleDate: string;
  deliveryDate: string;
  shippingDate: string;
  warehouse: string;
  intermediary: string;
  customerFreightCents: number;
  companyFreightCents: number;
  expensesCents: number;
  generalDiscountBasisPoints: number;
  items: readonly OrderItem[];
  payment: { method: string; channel: string; bank: string; category: string; terms: string };
  shipping: { method: string; freightType: string; trackingCode: string; trackingUrl: string; payer: string; carrier: string; volumes: number; sendToDispatch: boolean };
  notes: string;
  internalNotes: string;
}

export interface OrderTotals {
  itemCount: number;
  quantity: number;
  grossWeightGrams: number;
  netWeightGrams: number;
  productsCents: number;
  discountCents: number;
  saleCents: number;
}
