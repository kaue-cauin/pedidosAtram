import type { Order } from '../types/order';
// Canonical bytes bind the exact reviewed business payload, independent of key ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function submissionPayload(order: Order): string {
  const business = Object.fromEntries(Object.entries(order).filter(([key]) => !['status', 'submissionId', 'submission'].includes(key)));
  return canonical(business);
}
export function validateSubmission(order: Order): string[] {
  const errors: string[] = [];
  if (!order.customerId) errors.push('Selecione o cliente.');
  if (!order.sellerId) errors.push('Selecione o vendedor.');
  if (!order.items.length) errors.push('Inclua ao menos um produto.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.saleDate) || !Number.isFinite(Date.parse(order.saleDate))) errors.push('Informe a data de venda.');
  if (order.items.some(i => !Number.isFinite(i.quantity) || i.quantity <= 0 || !Number.isSafeInteger(i.unitPriceCents) || i.unitPriceCents < 0 || !Number.isSafeInteger(i.discountBasisPoints) || i.discountBasisPoints < 0 || i.discountBasisPoints > 10000)) errors.push('Revise quantidades, preços e descontos.');
  return errors;
}
export function assertSubmissionIntegrity(order: Order) {
  if (!order.submissionId || !order.submission || order.submission.payload !== submissionPayload(order)) throw new Error('O pedido difere da cópia confirmada. Envio bloqueado para preservar sua integridade.');
}
