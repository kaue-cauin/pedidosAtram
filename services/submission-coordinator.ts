import type { Order } from '../types/order';
import { assertSubmissionIntegrity, submissionPayload, validateSubmission } from '../domain/submission.ts';
import { ERPFailure, type ERPProvider, type ERPReceipt } from '../integrations/ERPProvider.ts';
export class SubmissionCoordinator {
  private busy = false;
  private get: () => Order;
  private persist: (order: Order) => Promise<void>;
  private provider: ERPProvider;
  constructor(get: () => Order, persist: (order: Order) => Promise<void>, provider: ERPProvider) { this.get = get; this.persist = persist; this.provider = provider; }
  private async exclusive(work: () => Promise<void>) {
    if (this.busy) throw new Error('Há uma operação de envio em andamento.');
    this.busy = true; try { await work(); } finally { this.busy = false; }
  }
  private async accepted(order: Order, receipt: ERPReceipt) {
    if (receipt.submissionId !== order.submissionId || receipt.orderId !== order.orderId || receipt.payload !== order.submission!.payload || !receipt.erpOrderId) throw new ERPFailure('Resposta incompatível com o pedido confirmado. Consulte novamente.', 'unknown');
    await this.persist({ ...order, status: 'SUBMITTED', submission: { ...order.submission!, erpOrderId: receipt.erpOrderId, message: 'Pedido criado no Mock ERP.', retryAt: undefined } });
  }
  async submit(reviewedPayload: string) {
    return this.exclusive(async () => {
      let order = this.get();
      if (order.status === 'SUBMITTED') return;
      if (order.status === 'UNKNOWN' || order.status === 'SUBMITTING') throw new Error('Consulte o resultado antes de reenviar.');
      if (reviewedPayload !== submissionPayload(order)) throw new Error('O pedido mudou. Revise novamente antes de confirmar.');
      const errors = validateSubmission(order); if (errors.length) throw new Error(errors.join(' '));
      const validation = await this.provider.validateOrder(order);
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (submissionPayload(this.get()) !== reviewedPayload) throw new Error('O pedido mudou. Revise novamente antes de confirmar.');
      if (order.submissionId) {
        assertSubmissionIntegrity(order);
        if ((order.submission?.retryAt ?? 0) > Date.now()) throw new Error('Aguarde o prazo indicado pelo ERP (HTTP 429).');
        // Every retry first looks up the same identity; not-found never rotates the key.
        const existing = await this.provider.findSubmission(order.submissionId);
        if (existing) { await this.accepted(order, existing); return; }
      } else {
        order = { ...order, submissionId: crypto.randomUUID(), submission: { payload: reviewedPayload, startedAt: new Date().toISOString() } };
      }
      order = { ...order, status: 'SUBMITTING', submission: { ...order.submission!, message: 'Envio em andamento. Não feche esta aba.', retryAt: undefined } };
      // Critical durability barrier. A failed save MUST prevent the outbound call.
      await this.persist(order);
      let receipt: ERPReceipt;
      try { receipt = await this.provider.createOrder(order, order.submissionId!); }
      catch (cause) {
        const e = cause instanceof ERPFailure ? cause : new ERPFailure(cause instanceof Error ? cause.message : 'Resposta indisponível.', 'unknown');
        await this.persist({ ...order, status: e.certainty === 'rejected' ? 'ERROR' : 'UNKNOWN', submission: { ...order.submission!, message: e.message, retryAt: e.retryAfterMs ? Date.now() + e.retryAfterMs : undefined } });
        return;
      }
      // Persistence failure after server success must leave the durable SUBMITTING record reconcilable.
      try { await this.accepted(order, receipt); }
      catch (e) {
        if (!(e instanceof ERPFailure)) throw e;
        await this.persist({ ...order, status: 'UNKNOWN', submission: { ...order.submission!, message: e.message } });
      }
    });
  }
  async reconcile() {
    return this.exclusive(async () => {
      const order = this.get(); assertSubmissionIntegrity(order);
      if (order.status === 'SUBMITTED') return;
      try {
        const receipt = await this.provider.findSubmission(order.submissionId!);
        if (receipt) await this.accepted(order, receipt);
        else await this.persist({ ...order, status: 'ERROR', submission: { ...order.submission!, message: 'Consulta não encontrou este envio. Uma nova confirmação usará a mesma identidade.' } });
      } catch (e) {
        // Includes lookup failure AND an incompatible receipt. Never automatically create.
        await this.persist({ ...order, status: 'UNKNOWN', submission: { ...order.submission!, message: e instanceof Error ? e.message : 'Consulta inconclusiva.' } });
      }
    });
  }
}
