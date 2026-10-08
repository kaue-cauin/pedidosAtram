import { products, customers, sellers, priceLists } from '../domain/mock-data.ts';
import { submissionPayload, validateSubmission } from '../domain/submission.ts';
import type { Order } from '../types/order';
import { ERPFailure, type ERPProvider } from './ERPProvider.ts';
export type MockScenario = 'success' | '400' | '401' | '429' | '500' | 'timeout-before' | 'timeout-after';
export { IndexedDBERPLedger, sameReceipt } from './erp-ledger.ts';
import { IndexedDBERPLedger, sameReceipt, type ERPLedger } from './erp-ledger.ts';
export class MockERPProvider implements ERPProvider {
  private ledger: ERPLedger;
  private options: () => { scenario: MockScenario; online?: boolean; delayMs?: number; retryAfterMs?: number };
  constructor(ledger: ERPLedger = new IndexedDBERPLedger(), options: MockERPProvider['options'] = () => ({ scenario: 'success' })) { this.ledger = ledger; this.options = options; }
  async getProducts() { return products; } async getCustomers() { return customers; } async getSellers() { return sellers; } async getPriceLists() { return priceLists; }
  async validateOrder(order: Order) { const errors = validateSubmission(order); if (!customers.some(c => c.id === order.customerId)) errors.push('Cliente inexistente.'); if (!sellers.some(s => s.id === order.sellerId)) errors.push('Vendedor inexistente.'); if (order.items.some(i => !products.some(p => p.id === i.productId && p.status === 'ACTIVE'))) errors.push('Produto inexistente ou inativo.'); return { valid: errors.length === 0, errors }; }
  async findSubmission(id: string) {
    if (this.options().online === false) throw new ERPFailure('Offline: consulta indisponível. Nenhum reenvio foi feito.', 'unknown');
    return this.ledger.find(id);
  }
  async findRejection(id: string) {
    if (this.options().online === false) throw new ERPFailure('Consulta de rejeição indisponível.', 'unknown');
    return this.ledger.findRejection(id);
  }
  async createOrder(order: Order, submissionId: string) {
    const opts = this.options();
    if (opts.online === false) throw new ERPFailure('Offline: envio interrompido. Consulte antes de tentar novamente.', 'unknown');
    const incoming = { orderId: order.orderId, submissionId, payload: submissionPayload(order), erpOrderId: 'MOCK-' + crypto.randomUUID() };
    const existing = await this.ledger.find(submissionId);
    if (existing) return sameReceipt(existing, incoming);
    if (await this.ledger.findRejection(submissionId)) return this.ledger.create(incoming);
    if (opts.delayMs ?? 250) await new Promise(r => setTimeout(r, opts.delayMs ?? 250));
    if (opts.scenario === '400') {
      const result = await this.ledger.reject({submissionId,orderId:order.orderId,payload:incoming.payload,rejectedAt:new Date().toISOString()});
      if ('erpOrderId' in result) return result;
      throw new ERPFailure('HTTP 400: condição de pagamento rejeitada. Corrija o pedido e revise novamente.', 'rejected', 0, 'validation');
    }
    if (['401', '429'].includes(opts.scenario)) throw new ERPFailure('HTTP ' + opts.scenario + ': pedido não criado nesta tentativa.', 'rejected', opts.scenario === '429' ? opts.retryAfterMs ?? 3000 : 0, opts.scenario === '401' ? 'auth' : 'rate-limit');
    if (opts.scenario === '500') throw new ERPFailure('HTTP 500: resultado precisa ser consultado.', 'unknown');
    if (opts.scenario === 'timeout-before') throw new ERPFailure('Timeout: não foi possível confirmar o resultado.', 'unknown');
    const receipt = await this.ledger.create(incoming);
    if (opts.scenario === 'timeout-after') throw new ERPFailure('Timeout: não foi possível confirmar o resultado.', 'unknown');
    return receipt;
  }
}
