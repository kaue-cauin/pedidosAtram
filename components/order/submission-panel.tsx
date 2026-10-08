'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order } from '@/types/order';
import { customers } from '@/domain/mock-data';
import { submissionPayload, validateSubmission } from '@/domain/submission';
import { calculateTotals } from '@/domain/totals';
import { MockERPProvider, type MockScenario } from '@/integrations/MockERPProvider';
import { SubmissionCoordinator } from '@/services/submission-coordinator';
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const scenarios: [MockScenario, string][] = [['success', 'Sucesso normal'], ['400', 'HTTP 400'], ['401', 'HTTP 401'], ['429', 'HTTP 429 · aguardar 3 segundos'], ['500', 'HTTP 500'], ['timeout-before', 'Timeout antes da criação'], ['timeout-after', 'Timeout depois da criação']];
const labels = { DRAFT: 'Rascunho', VALIDATING: 'Validando', READY: 'Pronto para confirmar', SUBMITTING: 'Enviando / confirmação pendente', SUBMITTED: 'Enviado ao Mock ERP', ERROR: 'Envio não confirmado', UNKNOWN: 'Resultado desconhecido' };
export function SubmissionPanel({ order, getOrder, persist, available }: { order: Order; getOrder: () => Order; persist: (order: Order) => Promise<void>; available: boolean }) {
  const [scenario, setScenario] = useState<MockScenario>('success');
  const coordinator = useMemo(() => new SubmissionCoordinator(getOrder, persist, new MockERPProvider(undefined, () => ({ scenario, online: navigator.onLine }))), [getOrder, persist, scenario]);
  const [review, setReview] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  function openReview() { if (!available || busy || ['SUBMITTING', 'UNKNOWN', 'SUBMITTED'].includes(getOrder().status)) return; openerRef.current = document.activeElement as HTMLElement; setReview(structuredClone(getOrder())); setMessage(''); }
  function closeReview() { setReview(null); openerRef.current?.focus(); }
  useEffect(() => { if (review) dialogRef.current?.showModal(); }, [review]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); openReview(); } }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  });
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await work(); closeReview(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Operação interrompida. Consulte o resultado antes de reenviar.'); }
    finally { setBusy(false); }
  }
  const errors = review ? validateSubmission(review) : [];
  const totals = review ? calculateTotals(review) : null;
  const uncertain = order.status === 'UNKNOWN' || order.status === 'SUBMITTING';
  return <section className="submission-panel" aria-label="Envio simulado ao ERP">
    <div className="submission-controls"><label htmlFor="erp-scenario">Cenário do Mock ERP <select aria-label="Cenário do Mock ERP" id="erp-scenario" value={scenario} disabled={busy} onChange={e => setScenario(e.target.value as MockScenario)}>{scenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="button primary" disabled={!available || busy || uncertain || order.status === 'SUBMITTED'} onClick={openReview}>{order.status === 'ERROR' ? 'Revisar mesma tentativa' : 'Revisar e enviar ao Mock ERP'}</button>
      {order.submissionId && order.status !== 'SUBMITTED' && <button className="button secondary" disabled={!available || busy} onClick={() => { void run(() => coordinator.reconcile()); }}>Consultar resultado no ERP</button>}
    </div>
    <div role="status" aria-live="polite"><strong>{labels[order.status]}</strong>{uncertain && <p>Consulte esta tentativa para saber se o ERP criou o pedido. O reenvio está bloqueado até a consulta.</p>}{order.submission?.message && <p>{order.submission.message}</p>}{order.submission?.erpOrderId && <p>Recibo: <strong>{order.submission.erpOrderId}</strong></p>}{order.submissionId && <p className="submission-identity">submissionId: {order.submissionId}</p>}{order.submission?.retryAt && <p>Nova tentativa permitida a partir de {new Date(order.submission.retryAt).toLocaleTimeString('pt-BR')}.</p>}{message && <p className="draft-error">{message}</p>}{busy && <p>Operação em andamento…</p>}</div>
    {order.submissionId && order.status !== 'SUBMITTED' && <p>Pedido bloqueado para preservar a cópia confirmada. Consultar nunca cria um pedido. Um reenvio confirmado mantém a mesma identidade.</p>}
    {!available && <p>O envio exige um rascunho aberto e armazenamento local disponível.</p>}
    <p className="mock-disclaimer">Simulação local: nenhum pedido é enviado a um ERP real. O recibo do Mock ERP é salvo separadamente neste navegador.</p>
    {review && <dialog ref={dialogRef} className="review-dialog" aria-labelledby="review-title" onCancel={e => { e.preventDefault(); if (!busy) closeReview(); }}>
      <h2 id="review-title">Revisar pedido antes de confirmar</h2><p>{customers.find(c => c.id === review.customerId)?.name ?? 'Cliente não selecionado'} · {review.items.length} itens · Total {money(totals!.saleCents)}</p>
      {errors.length > 0 && <ul role="alert" className="draft-error">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
      <div className="review-scroll"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Desconto</th></tr></thead><tbody>{review.items.map(i => <tr key={i.id}><td>{i.code} · {i.name}</td><td>{i.quantity}</td><td>{money(i.unitPriceCents)}</td><td>{i.discountBasisPoints / 100}%</td></tr>)}</tbody></table>
      <details><summary>Conferir todos os dados do pedido</summary><pre>{JSON.stringify(JSON.parse(submissionPayload(review)), null, 2)}</pre></details></div>
      <p>Ao confirmar, os dados serão bloqueados. Em caso de timeout, consulte o resultado antes de reenviar.</p>{message && <p role="alert" className="draft-error">{message}</p>}
      <div className="draft-actions"><button autoFocus className="button secondary" disabled={busy} onClick={closeReview}>Voltar à edição</button><button className="button primary" disabled={busy || errors.length > 0} onClick={() => { void run(() => coordinator.submit(submissionPayload(review))); }}>{busy ? 'Confirmando…' : 'Confirmar envio simulado'}</button></div>
    </dialog>}
  </section>;
}
