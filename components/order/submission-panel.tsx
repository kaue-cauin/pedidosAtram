'use client';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Order } from '@/types/order';
import { customers, sellers } from '@/domain/mock-data';
import { canCorrect, orderStatusLabel, submissionPayload, validateSubmission } from '@/domain/submission';
import { calculateTotals } from '@/domain/totals';
import { MockERPProvider, type MockScenario } from '@/integrations/MockERPProvider';
import { SubmissionCoordinator } from '@/services/submission-coordinator';
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (date?:string) => date ? new Date(date).toLocaleString('pt-BR') : '—';
const scenarios: [MockScenario, string][] = [['success', 'Sucesso normal'], ['400', 'Rejeição de conteúdo (400)'], ['401', 'Autenticação necessária (401)'], ['429', 'Limite de requisições (429 · 3 s)'], ['500', 'Falha do ERP (500)'], ['timeout-before', 'Timeout antes da criação'], ['timeout-after', 'Timeout depois da criação']];
function useRetryDeadline(until?: number) {
 const subscribe=useCallback((notify:()=>void)=>{if(!until)return()=>{};const timer=setTimeout(notify,Math.max(0,until-Date.now())+20);return()=>clearTimeout(timer);},[until]);
 const snapshot=useCallback(()=>!until||Date.now()>=until,[until]);
 return useSyncExternalStore(subscribe,snapshot,()=>!until);
}
function operatorMessage(order:Order) {
 if(order.status==='SUBMITTING')return 'Este pedido estava sendo enviado quando a sessão anterior foi interrompida. Consulte o resultado antes de continuar.';
 if(order.status==='UNKNOWN')return 'O ERP não confirmou o resultado. Consulte para saber se o pedido foi criado. A edição e o reenvio estão bloqueados.';
 if(order.status==='SUBMITTED')return 'Pedido enviado com sucesso.';
 if(order.submission?.failureKind==='validation')return 'O ERP rejeitou a condição de pagamento. Corrija o pedido e faça uma nova revisão.';
 if(order.submission?.failureKind==='auth')return 'Autenticação com o ERP necessária. Depois de resolvida, confirme novamente o mesmo pedido.';
 if(order.submission?.failureKind==='rate-limit')return 'Limite de requisições atingido. Aguarde a liberação para repetir a mesma tentativa.';
 if(order.status==='ERROR')return 'O pedido permanece preservado. Uma nova confirmação usará a mesma tentativa.';
 return 'Confira o cliente, os produtos e as condições antes de enviar.';
}
export function SubmissionPanel({ order, getOrder, persist, available, preview=false }: { order: Order; getOrder: () => Order; persist: (order: Order) => Promise<void>; available: boolean; preview?:boolean }) {
 const [scenario,setScenario]=useState<MockScenario>('success');
 const coordinator=useMemo(()=>new SubmissionCoordinator(getOrder,persist,new MockERPProvider(undefined,()=>({scenario,online:navigator.onLine}))),[getOrder,persist,scenario]);
 const [review,setReview]=useState<Order|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const dialogRef=useRef<HTMLDialogElement>(null),openerRef=useRef<HTMLElement|null>(null);
 const deadlineReady=useRetryDeadline(order.submission?.retryAt);
 const uncertain=order.status==='UNKNOWN'||order.status==='SUBMITTING';
 const blocked=!available||busy||uncertain||order.status==='SUBMITTED'||canCorrect(order)||!deadlineReady;
 function openReview(){if(blocked)return;openerRef.current=document.activeElement as HTMLElement;setReview(structuredClone(getOrder()));setMessage('');}
 function closeReview(){dialogRef.current?.close();setReview(null);queueMicrotask(()=>{const opener=openerRef.current;if(opener?.isConnected&&!opener.closest('[inert]')&&!opener.hasAttribute('disabled'))opener.focus();else document.getElementById('submission-result')?.focus();});}
 useEffect(()=>{if(review){dialogRef.current?.showModal();dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();}},[review]);
 function trapFocus(e:React.KeyboardEvent<HTMLDialogElement>){
  if(e.key!=='Tab')return;
  const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
  const first=elements[0],last=elements.at(-1);if(!first)return;
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }

 const keyboard=useEffectEvent((e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();if(!review)openReview();}});
 useEffect(()=>{const handler=(e:KeyboardEvent)=>keyboard(e);window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 async function run(work:()=>Promise<void>){setBusy(true);setMessage('');try{await work();closeReview();}catch(e){setMessage(e instanceof Error?e.message:'Operação interrompida. Consulte o resultado.');}finally{setBusy(false);}}
 const errors=useMemo(()=>review?validateSubmission(review):[],[review]);
 const totals=useMemo(()=>review?calculateTotals(review):null,[review]);
 return <section className={`submission-panel submission-${order.status.toLowerCase()}`} aria-label="Envio do pedido">
  <div className="submission-controls">
   <button id="review-order" className="button primary" disabled={blocked} onClick={openReview}>{order.status==='ERROR'?'Revisar mesma tentativa':'Revisar pedido'}</button>
   {canCorrect(order)&&<button className="button primary" disabled={!available||busy} onClick={()=>{void run(()=>coordinator.correct());}}>Corrigir pedido</button>}
   {order.submissionId&&order.status!=='SUBMITTED'&&<button className={`button ${uncertain?'primary':'secondary'}`} disabled={!available||busy} onClick={()=>{void run(()=>coordinator.reconcile());}}>Consultar resultado no ERP</button>}
   <span className="mock-disclaimer">Ambiente de demonstração · envio somente ao Mock ERP</span>
  </div>
  <div id="submission-result" tabIndex={-1} role="status" aria-live="polite"><strong>{busy?'Operação em andamento…':orderStatusLabel(order)}</strong><p>{busy?'Aguarde a confirmação. O pedido está preservado.':operatorMessage(order)}</p>
   {order.submission?.erpOrderId&&<p>Número no ERP: <strong>{order.submission.erpOrderId}</strong> · {dateTime(order.submission.finishedAt)}</p>}
   {order.submission?.retryAt&&<p>Nova tentativa disponível às {new Date(order.submission.retryAt).toLocaleTimeString('pt-BR')}.{deadlineReady?' Prazo encerrado.':''}</p>}{message&&<p className="draft-error" role="alert">{message}</p>}
  </div>
  {!available&&<p className="draft-error">Abra um rascunho com armazenamento disponível. Pedidos apenas em memória não podem ser enviados.</p>}
  <details className="submission-details"><summary>Detalhes do envio e histórico local</summary>
   {order.submissionId&&<p className="submission-identity">submissionId: {order.submissionId}</p>}{order.submission?.message&&<p>{order.submission.message}</p>}
   {order.submissionHistory?.map(attempt=><article key={attempt.submissionId}><strong>Tentativa rejeitada · {dateTime(attempt.finishedAt)}</strong><p>{attempt.message}</p><p className="submission-identity">{attempt.submissionId}</p><details><summary>Cópia confirmada desta tentativa</summary><pre>{attempt.payload}</pre></details></article>)}
   {!!order.submissionEvents?.length&&<ol>{order.submissionEvents.map((e,i)=><li key={i}>{dateTime(e.at)} · {e.message??e.type}</li>)}</ol>}
   <p>Simulação local: nenhum pedido é enviado a um ERP real. Os recibos pertencem a este navegador.</p>
  </details>
  <details className="mock-controls"><summary>Simular resultado do ERP</summary><label htmlFor="erp-scenario">Cenário do Mock ERP</label><select aria-label="Cenário do Mock ERP" id="erp-scenario" value={scenario} disabled={busy} onChange={e=>setScenario(e.target.value as MockScenario)}>{scenarios.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><p>Para simular autenticação resolvida ou ERP recuperado, escolha Sucesso normal. Nada é reenviado automaticamente.</p></details>
  {review&&<dialog ref={dialogRef} className="review-dialog" aria-labelledby="review-title" aria-describedby="review-warning" onKeyDown={trapFocus} onCancel={e=>{e.preventDefault();if(!busy)closeReview();}}>
   <header className="review-header"><h2 id="review-title">Revisar pedido</h2><p id="review-warning">Você está prestes a enviar este pedido ao Mock ERP. Ao confirmar, os dados serão bloqueados.</p></header>
   <dl className="review-summary">{[
    ['Cliente',customers.find(c=>c.id===review.customerId)?.name??'Não selecionado'],['Vendedor',sellers.find(s=>s.id===review.sellerId)?.name??'Não selecionado'],['Data de venda',review.saleDate],['Itens / quantidade',`${review.items.length} itens · ${totals!.quantity} unidades`],['Total da venda',money(totals!.saleCents)],['Pagamento',`${review.payment.method} · ${review.payment.terms}`],['Frete',review.shipping.freightType||'Não informado'],['Transportadora',review.shipping.carrier||'Não informada']
   ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   {errors.length>0&&<ul role="alert" className="draft-error">{errors.map(e=><li key={e}>{e}</li>)}</ul>}
   <div className="review-scroll" tabIndex={0} aria-label="Produtos e observações para revisão"><table aria-label="Itens para revisão"><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Desconto</th></tr></thead><tbody>{review.items.map(i=><tr key={i.id}><td>{i.code} · {i.name}</td><td>{i.quantity}</td><td>{money(i.unitPriceCents)}</td><td>{i.discountBasisPoints/100}%</td></tr>)}</tbody></table>
    {(review.notes||review.internalNotes)&&<section><h3>Observações</h3><p>{review.notes}</p><h3>Observações internas</h3><p>{review.internalNotes}</p></section>}
    <details><summary>Conferir todos os dados do pedido</summary><pre>{JSON.stringify(JSON.parse(submissionPayload(review)),null,2)}</pre></details>
   </div>
   <footer className="review-footer">{message&&<p role="alert" className="draft-error">{message}</p>}<div className="draft-actions"><button autoFocus className="button secondary" disabled={busy} onClick={closeReview}>Voltar à edição</button><button className="button primary" disabled={preview||busy||errors.length>0} onClick={()=>{void run(()=>coordinator.submit(submissionPayload(review)));}}>{busy?'Confirmando…':'Confirmar envio'}</button></div></footer>
  </dialog>}
 </section>;
}
