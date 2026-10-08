import type { Order } from '../types/order';
// Canonical bytes bind the exact reviewed business payload, independent of key ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function submissionPayload(order: Order): string {
  const business = Object.fromEntries(Object.entries(order).filter(([key]) => !['status', 'submissionId', 'submission', 'submissionHistory', 'submissionEvents'].includes(key)));
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

export const isEditable = (order: Order) => order.status === 'DRAFT' && !order.submissionId;
export const canCorrect = (order: Order) => order.status === 'ERROR' && order.submission?.failureKind === 'validation';
export function orderStatusLabel(order: Order): string {
  if (order.status === 'ERROR') return order.submission?.failureKind === 'auth' ? 'Autenticação necessária' : order.submission?.failureKind === 'rate-limit' ? 'Aguardando liberação do ERP' : order.submission?.failureKind === 'validation' ? 'Pedido rejeitado pelo ERP' : 'Envio aguardando nova confirmação';
  return {DRAFT:'Rascunho',VALIDATING:'Validando pedido',READY:'Pronto para confirmar',SUBMITTING:'Enviando / confirmação pendente',SUBMITTED:'Pedido enviado',UNKNOWN:'Resultado do envio precisa ser confirmado'}[order.status];
}
// Runs inside the same transaction as revision CAS; archives and log are append-only.
export function assertOrderTransition(previous: Order | undefined, next: Order) {
  if (!previous) return;
  const history=previous.submissionHistory ?? [], events=previous.submissionEvents ?? [];
  if (JSON.stringify((next.submissionHistory ?? []).slice(0,history.length))!==JSON.stringify(history) || JSON.stringify((next.submissionEvents ?? []).slice(0,events.length))!==JSON.stringify(events)) throw new Error('Histórico de envio imutável: gravação bloqueada.');
  const appended=(next.submissionHistory ?? []).slice(history.length);
  if (previous.submissionId) {
    if (isEditable(next)) {
      const archive={...previous.submission,submissionId:previous.submissionId,status:'REJECTED_VALIDATION',finishedAt:previous.submission?.finishedAt};
      if (!canCorrect(previous) || appended.length!==1 || JSON.stringify(appended[0])!==JSON.stringify(archive) || submissionPayload(previous)!==submissionPayload(next)) throw new Error('Apenas uma rejeição de conteúdo confirmada permite corrigir o pedido.');
    } else {
      if (next.submissionId!==previous.submissionId || next.submission?.payload!==previous.submission?.payload || appended.length) throw new Error('A identidade e a cópia confirmada não podem ser alteradas.');
      if (previous.status==='SUBMITTED' && (next.status!=='SUBMITTED' || next.submission?.erpOrderId!==previous.submission?.erpOrderId)) throw new Error('Um pedido enviado não pode voltar ao rascunho.');
    }
  } else if (appended.length) throw new Error('Tentativas antigas não podem ser inventadas.');
}
