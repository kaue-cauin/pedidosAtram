import type { Order } from '../types/order';
import { assertSubmissionIntegrity, canCorrect, submissionPayload, validateSubmission } from '../domain/submission.ts';
import { ERPFailure, type ERPProvider, type ERPReceipt } from '../integrations/ERPProvider.ts';
function event(order: Order, type: string, message?: string): Order { return {...order,submissionEvents:[...(order.submissionEvents ?? []),{at:new Date().toISOString(),type,submissionId:order.submissionId!,...(message ? {message}: {})}]}; }
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
    await this.persist(event({ ...order, status: 'SUBMITTED', submission: { ...order.submission!, erpOrderId: receipt.erpOrderId, message: 'Pedido enviado com sucesso.', retryAt: undefined, failureKind: undefined, finishedAt: new Date().toISOString() } },'SUBMITTED','Recibo confirmado no ERP.'));
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
        if (order.submissionHistory?.at(-1)?.payload === reviewedPayload) throw new Error('Corrija ao menos um dado do pedido antes da nova revisão.');
        order = { ...order, submissionId: crypto.randomUUID(), submission: { payload: reviewedPayload, startedAt: new Date().toISOString() } };
      }
      order = event({ ...order, status: 'SUBMITTING', submission: { ...order.submission!, message: 'Envio em andamento.', retryAt: undefined, failureKind: undefined, finishedAt: undefined } }, 'SUBMITTING', 'Revisão confirmada; envio iniciado.');
      // Critical durability barrier. A failed save MUST prevent the outbound call.
      await this.persist(order);
      let receipt: ERPReceipt;
      try { receipt = await this.provider.createOrder(order, order.submissionId!); }
      catch (cause) {
        const e = cause instanceof ERPFailure ? cause : new ERPFailure(cause instanceof Error ? cause.message : 'Resposta indisponível.', 'unknown');
        await this.persist(event({ ...order, status: e.certainty === 'rejected' ? 'ERROR' : 'UNKNOWN', submission: { ...order.submission!, message: e.message, failureKind: e.kind, finishedAt: new Date().toISOString(), retryAt: e.retryAfterMs ? Date.now() + e.retryAfterMs : undefined } }, 'RESULT', e.message));
        return;
      }
      // Persistence failure after server success must leave the durable SUBMITTING record reconcilable.
      try { await this.accepted(order, receipt); }
      catch (e) {
        if (!(e instanceof ERPFailure)) throw e;
        await this.persist({ ...order, status: 'UNKNOWN', submission: { ...order.submission!, message: e.message, failureKind: 'unknown' } });
      }
    });
  }
  async reconcile() {
    return this.exclusive(async () => {
      let order = this.get(); assertSubmissionIntegrity(order);
      if (order.status === 'SUBMITTED') return;
      order = event(order, 'LOOKUP', 'Consulta iniciada.');
      await this.persist(order);
      try {
        const receipt = await this.provider.findSubmission(order.submissionId!);
        if (receipt) await this.accepted(order, receipt);
        else {
          const rejection = await this.provider.findRejection(order.submissionId!);
          if (rejection && (rejection.orderId !== order.orderId || rejection.payload !== order.submission!.payload)) throw new ERPFailure('Rejeição incompatível com este pedido.', 'unknown');
          await this.persist(event({ ...order, status: 'ERROR', submission: { ...order.submission!, failureKind: rejection ? 'validation' : order.submission?.failureKind === 'rate-limit' ? 'rate-limit' : 'not-found', finishedAt: order.submission?.finishedAt ?? new Date().toISOString(), message: rejection ? 'O ERP confirmou a rejeição de conteúdo. Corrija o pedido.' : 'Consulta não encontrou este envio. Confirme novamente com a mesma identidade.' } }, 'NOT_FOUND', rejection ? 'Rejeição confirmada.' : 'Pedido não encontrado.'));
        }
      } catch (e) {
        // Includes lookup failure AND an incompatible receipt. Never automatically create.
        await this.persist(event({ ...order, status: 'UNKNOWN', submission: { ...order.submission!, failureKind: 'unknown', message: e instanceof Error ? e.message : 'Consulta inconclusiva.' } }, 'LOOKUP_FAILED', 'Consulta inconclusiva.'));
      }
    });
  }
  async correct() {
    return this.exclusive(async () => {
      const order=this.get();assertSubmissionIntegrity(order);
      if(!canCorrect(order))throw new Error('Somente uma rejeição de conteúdo confirmada permite correção.');
      let rejection;
      try {
        const receipt=await this.provider.findSubmission(order.submissionId!);
        if(receipt){await this.accepted(order,receipt);return;}
        rejection=await this.provider.findRejection(order.submissionId!);
        if(!rejection || rejection.orderId!==order.orderId || rejection.payload!==order.submission!.payload)throw new ERPFailure('A rejeição não pôde ser confirmada. Consulte o resultado.','unknown');
      } catch(e) {
        await this.persist(event({...order,status:'UNKNOWN',submission:{...order.submission!,failureKind:'unknown',message:e instanceof Error?e.message:'Consulta inconclusiva.'}},'LOOKUP_FAILED','Correção bloqueada por consulta inconclusiva.'));return;
      }
      const archive={...order.submission!,submissionId:order.submissionId!,status:'REJECTED_VALIDATION' as const,finishedAt:order.submission!.finishedAt!};
      const editable:Order=event({...order,status:'DRAFT',submissionHistory:[...(order.submissionHistory??[]),archive]},'CORRECTION','Tentativa rejeitada arquivada; correção autorizada.');
      editable.submissionId=null;delete editable.submission;
      await this.persist(editable);
    });
  }

}
