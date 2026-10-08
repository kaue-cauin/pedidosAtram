import { assertSubmissionIntegrity, assertOrderTransition } from '../domain/submission.ts';
import type { Order } from '../types/order';
import type { SaveReceipt } from '../services/autosave-queue';

export const DRAFT_DATABASE = 'atram-pedidos-v1';
export const DRAFT_STORE = 'drafts';
export interface DraftRecord { schemaVersion: 1 | 2 | 3; orderId: string; revision: number; savedAt: string; order: Order }
export interface PersistenceSimulation { delayMs: number; failWrites?: boolean }
const text = (v: unknown): v is string => typeof v === 'string';
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validateDraft(value: unknown): DraftRecord {
  if (!object(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)) throw new Error('Rascunho de versão desconhecida. Os dados existentes foram preservados.');
  const o = value.order;
  if (!object(o) || !text(value.orderId) || !value.orderId || o.orderId !== value.orderId || !Number.isInteger(value.revision) || Number(value.revision) < 1 || !text(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt))) throw new Error('Rascunho inválido. Os dados existentes foram preservados.');
  const strings = ['orderId', 'sellerId', 'operation', 'number', 'priceListId', 'saleDate', 'deliveryDate', 'shippingDate', 'warehouse', 'intermediary', 'notes', 'internalNotes'];
  if (strings.some(k => !text(o[k])) || !['DRAFT', 'SUBMITTING', 'SUBMITTED', 'ERROR', 'UNKNOWN'].includes(String(o.status)) || !(o.customerId === null || text(o.customerId))) throw new Error('Dados do pedido inválidos.');
  if (['customerFreightCents', 'companyFreightCents', 'expensesCents', 'generalDiscountBasisPoints'].some(k => !numeric(o[k])) || !Array.isArray(o.items)) throw new Error('Valores do pedido inválidos.');
  const ids = new Set<string>();
  for (const i of o.items) {
    if (!object(i) || ['id', 'productId', 'code', 'name', 'brand', 'unit'].some(k => !text(i[k])) || !i.id || ids.has(String(i.id)) || ['quantity', 'unitPriceCents', 'discountBasisPoints', 'grossWeightGrams', 'netWeightGrams'].some(k => !numeric(i[k])) || Number(i.quantity) <= 0 || Number(i.discountBasisPoints) > 10000 || !Number.isSafeInteger(i.unitPriceCents) || !Number.isSafeInteger(i.discountBasisPoints)) throw new Error('Itens do rascunho inválidos.');
    ids.add(String(i.id));
  }
  if (!object(o.payment) || ['method', 'channel', 'bank', 'category', 'terms'].some(k => !text((o.payment as Record<string, unknown>)[k]))) throw new Error('Pagamento do rascunho inválido.');
  if (!object(o.shipping) || ['method', 'freightType', 'trackingCode', 'trackingUrl', 'payer', 'carrier'].some(k => !text((o.shipping as Record<string, unknown>)[k])) || !numeric(o.shipping.volumes) || typeof o.shipping.sendToDispatch !== 'boolean') throw new Error('Transporte do rascunho inválido.');
  if (o.status === 'DRAFT') {
    if (o.submissionId !== null || o.submission !== undefined) throw new Error('Identidade de envio inválida no rascunho.');
  } else {
    if ((value.schemaVersion !== 2 && value.schemaVersion !== 3) || !text(o.submissionId) || !o.submissionId || !object(o.submission) || !text(o.submission.payload) || !text(o.submission.startedAt) || !Number.isFinite(Date.parse(o.submission.startedAt))) throw new Error('Registro de envio inválido.');
    if (o.submission.message !== undefined && !text(o.submission.message)) throw new Error('Mensagem de envio inválida.');
    if (o.submission.retryAt !== undefined && !numeric(o.submission.retryAt)) throw new Error('Prazo de envio inválido.');
    if (o.status === 'SUBMITTED' && (!text(o.submission.erpOrderId) || !o.submission.erpOrderId)) throw new Error('Recibo do ERP ausente.');
    assertSubmissionIntegrity(o as unknown as Order);
  }
  if (o.submissionHistory !== undefined) {
    if (value.schemaVersion !== 3 || !Array.isArray(o.submissionHistory)) throw new Error('Histórico de envio inválido.');
    const submissions=new Set<string>();
    for(const entry of o.submissionHistory) {
      if(!object(entry) || !text(entry.submissionId) || !entry.submissionId || submissions.has(entry.submissionId) || entry.submissionId===o.submissionId || entry.status!=='REJECTED_VALIDATION' || entry.failureKind!=='validation' || !text(entry.payload) || !text(entry.startedAt) || !text(entry.finishedAt) || !Number.isFinite(Date.parse(entry.startedAt)) || !Number.isFinite(Date.parse(entry.finishedAt)) || Date.parse(entry.finishedAt)<Date.parse(entry.startedAt)) throw new Error('Tentativa arquivada inválida.');
      const business=JSON.parse(entry.payload);
      validateDraft({schemaVersion:2,orderId:o.orderId,revision:1,savedAt:entry.finishedAt,order:{...business,status:'ERROR',submissionId:entry.submissionId,submission:entry}});
      submissions.add(entry.submissionId);
    }
  }
  if(o.submissionEvents !== undefined) {
    if(value.schemaVersion!==3 || !Array.isArray(o.submissionEvents) || o.submissionEvents.some(e=>!object(e)||!text(e.at)||!Number.isFinite(Date.parse(e.at))||!text(e.type)||!text(e.submissionId)||!e.submissionId||(e.message!==undefined&&!text(e.message)))) throw new Error('Log de envio inválido.');
  }
  if(object(o.submission) && (o.submission.failureKind!==undefined && !['validation','auth','rate-limit','unknown','not-found','legacy-rejected'].includes(String(o.submission.failureKind)) || o.submission.finishedAt!==undefined && (!text(o.submission.finishedAt)||!Number.isFinite(Date.parse(o.submission.finishedAt))))) throw new Error('Classificação de envio inválida.');
  return value as unknown as DraftRecord;
}

export class DraftRepository {
  private connection?: Promise<IDBDatabase>;
  private name: string;
  private simulation: () => PersistenceSimulation;
  constructor(name = DRAFT_DATABASE, simulation: () => PersistenceSimulation = () => ({ delayMs: 0 })) { this.name = name; this.simulation = simulation; }
  private open() {
    if (this.connection) return this.connection;
    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível neste navegador.')); return; }
      const request = indexedDB.open(this.name, 1);
      let expired = false;
      const timeout = setTimeout(() => { expired = true; reject(new Error('O armazenamento local demorou para responder. Feche outras abas e tente novamente.')); }, 5000);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(DRAFT_STORE)) request.result.createObjectStore(DRAFT_STORE, { keyPath: 'orderId' }); };
      request.onerror = () => { clearTimeout(timeout); reject(new Error(request.error?.message ?? 'Não foi possível abrir o armazenamento local.')); };
      request.onblocked = () => { clearTimeout(timeout); expired = true; reject(new Error('Armazenamento bloqueado por outra aba. Feche-a e tente novamente.')); };
      request.onsuccess = () => {
        clearTimeout(timeout); const db = request.result;
        if (expired) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = undefined; };
        resolve(db);
      };
    }).catch(error => { this.connection = undefined; throw error; });
    return this.connection;
  }
  async list(): Promise<DraftRecord[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const request = tx.objectStore(DRAFT_STORE).getAll();
      tx.oncomplete = () => { try { resolve(request.result.map(validateDraft).sort((a, b) => b.savedAt.localeCompare(a.savedAt))); } catch (error) { reject(error); } };
      tx.onabort = () => reject(new Error(tx.error?.message ?? 'Falha ao carregar os rascunhos.'));
    });
  }
  async save(order: Order, expectedRevision: number): Promise<SaveReceipt> {
    const persistenceStart = performance.now();
    const simulation = this.simulation();
    if (simulation.delayMs > 0) await new Promise(r => setTimeout(r, simulation.delayMs));
    if (simulation.failWrites) throw new Error('Falha de armazenamento simulada. Alterações continuam em memória.');
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const start = performance.now();
      // Report saved only on transaction complete, never on put.onsuccess.
      let tx: IDBTransaction;
      try { tx = db.transaction(DRAFT_STORE, 'readwrite', { durability: 'strict' }); }
      catch { tx = db.transaction(DRAFT_STORE, 'readwrite'); }
      const store = tx.objectStore(DRAFT_STORE);
      const request = store.get(order.orderId);
      let error: Error | undefined;
      const savedAt = new Date().toISOString();
      request.onsuccess = () => {
        try {
          const existing = request.result === undefined ? undefined : validateDraft(request.result);
          if ((existing?.revision ?? 0) !== expectedRevision) throw new Error('Outra aba alterou este pedido. Exporte suas alterações e reabra o rascunho para evitar sobrescrita.');
          assertOrderTransition(existing?.order, order);
          const record: DraftRecord = { schemaVersion: 3, orderId: order.orderId, revision: expectedRevision + 1, savedAt, order };
          validateDraft(record); store.put(record);
        } catch (cause) { error = cause as Error; tx.abort(); }
      };
      tx.oncomplete = () => resolve({ revision: expectedRevision + 1, savedAt, indexedDbMs: performance.now() - start, persistenceMs: performance.now() - persistenceStart });
      tx.onabort = () => reject(error ?? new Error(tx.error?.name === 'QuotaExceededError' ? 'Espaço local insuficiente. Exporte o pedido e libere espaço antes de tentar novamente.' : tx.error?.message ?? 'Falha na gravação local. Exporte o pedido para preservá-lo.'));
    });
  }
  async close() { const db = await this.connection?.catch(() => undefined); db?.close(); this.connection = undefined; }
}
