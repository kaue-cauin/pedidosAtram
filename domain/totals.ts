import type { Order, OrderItem, OrderTotals } from '../types/order';

export function itemTotalCents(item: OrderItem): number {
  return Math.round(item.quantity * item.unitPriceCents * (10000 - item.discountBasisPoints) / 10000);
}

// Used once to derive the visual fixture. Incremental mutation belongs to stage 3.
export function calculateTotals(order: Order): OrderTotals {
  const totals = order.items.reduce((acc, item) => ({
    ...acc,
    itemCount: acc.itemCount + 1,
    quantity: acc.quantity + item.quantity,
    grossWeightGrams: acc.grossWeightGrams + item.grossWeightGrams * item.quantity,
    netWeightGrams: acc.netWeightGrams + item.netWeightGrams * item.quantity,
    productsCents: acc.productsCents + itemTotalCents(item),
  }), { itemCount: 0, quantity: 0, grossWeightGrams: 0, netWeightGrams: 0, productsCents: 0, discountCents: 0, saleCents: 0 });
  totals.discountCents = Math.round(totals.productsCents * order.generalDiscountBasisPoints / 10000);
  totals.saleCents = totals.productsCents - totals.discountCents + order.customerFreightCents + order.expensesCents;
  return totals;
}
