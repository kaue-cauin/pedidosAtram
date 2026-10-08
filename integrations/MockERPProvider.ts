import { products, customers, sellers, priceLists } from '../domain/mock-data.ts';
import { submissionPayload, validateSubmission } from '../domain/submission.ts';
import type { Order } from '../types/order';
import { ERPFailure, type ERPProvider, type ERPReceipt } from './ERPProvider.ts';
export type MockScenario = 'success' | '400' | '401' | '429' | '500' | 'timeout-before' | 'timeout-after';
export interface ERPLedger {
  find(id: string): Promise<ERPReceipt | null>;
  // Atomic, durable, UNIQUE submissionId and UNIQUE orderId. Never overwrite a receipt.
  create(receipt: ERPReceipt): Promise<ERPReceipt>;
}
export function sameReceipt(existing: ERPReceipt, incoming: ERPReceipt): ERPReceipt {
  if (existing.submissionId !== incoming.submissionId || existing.orderId !== incoming.orderId || existing.payload !== incoming.payload) throw new ERPFailure('Conflito de identidade ou conteúdo no ERP. Consulte o resultado; não gere outra tentativa.', 'unknown');
  return existing;
}
export class IndexedDBERPLedger implements ERPLedger {
  private connection?: Promise<IDBDatabase>;
  private name: string;
  constructor(name = 'atram-mock-erp-v1') { this.name = name; }
  async close() { (await this.connection?.catch(() => undefined))?.close(); this.connection = undefined; }
  private open() {
    this.connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      let expired = false;
      const timer = setTimeout(() => { expired = true; reject(new Error('Mock ERP indisponível.')); }, 5000);
      req.onupgradeneeded = () => { const s = req.result.createObjectStore('receipts', { keyPath: 'submissionId' }); s.createIndex('orderId', 'orderId', { unique: true }); };
      req.onerror = () => { clearTimeout(timer); reject(req.error); };
      req.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('Mock ERP bloqueado por outra aba.')); };
      req.onsuccess = () => { clearTimeout(timer); if (expired) { req.result.close(); return; } req.result.onversionchange = () => { req.result.close(); this.connection = undefined; }; resolve(req.result); };
    }).catch(e => { this.connection = undefined; throw e; });
    return this.connection;
  }
  async find(id: string) {
    const db = await this.open();
    return new Promise<ERPReceipt | null>((resolve, reject) => {
      const tx = db.transaction('receipts', 'readonly'); const req = tx.objectStore('receipts').get(id);
      tx.oncomplete = () => resolve(req.result ?? null); tx.onabort = () => reject(tx.error ?? new Error('Consulta ao Mock ERP falhou.'));
    });
  }
  async create(receipt: ERPReceipt) {
    const db = await this.open();
    return new Promise<ERPReceipt>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction('receipts', 'readwrite', { durability: 'strict' }); } catch { tx = db.transaction('receipts', 'readwrite'); }
      const store = tx.objectStore('receipts'); let result = receipt; let error: unknown;
      const req = store.get(receipt.submissionId);
      req.onsuccess = () => {
        try {
          if (req.result) { result = sameReceipt(req.result, receipt); return; }
          const byOrder = store.index('orderId').get(receipt.orderId);
          byOrder.onsuccess = () => {
            try { if (byOrder.result) result = sameReceipt(byOrder.result, receipt); else store.add(receipt); }
            catch (e) { error = e; tx.abort(); }
          };
        } catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('Gravação no Mock ERP falhou.'));
    });
  }
}
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
  async createOrder(order: Order, submissionId: string) {
    const opts = this.options();
    if (opts.online === false) throw new ERPFailure('Offline: envio interrompido. Consulte antes de tentar novamente.', 'unknown');
    const incoming = { orderId: order.orderId, submissionId, payload: submissionPayload(order), erpOrderId: 'MOCK-' + crypto.randomUUID() };
    const existing = await this.ledger.find(submissionId);
    if (existing) return sameReceipt(existing, incoming);
    if (opts.delayMs ?? 250) await new Promise(r => setTimeout(r, opts.delayMs ?? 250));
    if (['400', '401', '429'].includes(opts.scenario)) throw new ERPFailure('HTTP ' + opts.scenario + ': pedido não criado nesta tentativa.', 'rejected', opts.scenario === '429' ? opts.retryAfterMs ?? 3000 : 0);
    if (opts.scenario === '500') throw new ERPFailure('HTTP 500: resultado precisa ser consultado.', 'unknown');
    if (opts.scenario === 'timeout-before') throw new ERPFailure('Timeout: não foi possível confirmar o resultado.', 'unknown');
    const receipt = await this.ledger.create(incoming);
    if (opts.scenario === 'timeout-after') throw new ERPFailure('Timeout: não foi possível confirmar o resultado.', 'unknown');
    return receipt;
  }
}
