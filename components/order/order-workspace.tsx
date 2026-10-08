'use client';

import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { orderStatusLabel } from '@/domain/submission';
import { useDraftOrder } from '@/hooks/use-draft-order';
import { FilePenLine, Info, Save, ShieldCheck } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Navigation, Topbar } from './navigation';
import { CustomerDetails, OrderDates, OrderDetails } from './order-details';
import { OrderItems } from './order-items';
import { AdditionalDetails, OrderSummary } from './order-summary';
import { OrderTabs } from './order-tabs';
import { DraftStatus } from './draft-status';
import { SubmissionPanel } from './submission-panel';

export function OrderWorkspace({previewItems}:{previewItems?:number} = {}) {
  const draft = useDraftOrder(previewItems);
  const [selected, setSelected] = useState(0);
  const [manualMessage, setManualMessage] = useState('');
  const ready = draft.phase === 'ready';
  const saveNow = draft.saveNow;
  useEffect(() => { if (ready) document.getElementById('product-entry')?.focus(); }, [ready]);
  const save = useCallback(async () => {
    try { await saveNow(); setManualMessage('Rascunho salvo localmente.'); }
    catch (error) { setManualMessage((error as Error).message); }
  }, [saveNow]);
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
      if (!ready || document.querySelector('dialog[open]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return; }
      if (event.key !== 'F2' && event.key !== 'F4') return;
      event.preventDefault(); document.getElementById(event.key === 'F2' ? 'customer-search' : 'product-entry')?.focus();
  });
  useEffect(() => { const handler = (event: KeyboardEvent) => shortcut(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return <SidebarProvider className="app-shell"><a className="skip-link" href="#product-entry">Ir para os itens do pedido</a><Navigation /><div className="main-shell"><Topbar /><main id="novo-pedido" className="order-workspace"><header className="page-header"><div className="page-title"><div className="title-icon"><FilePenLine /></div><div><div className="title-line"><h1>Novo Pedido de Venda</h1><span className="draft-badge">{orderStatusLabel(draft.order)}</span></div><p>Digite o pedido de forma rápida e eficiente</p></div></div><div className="page-actions"><button className="button secondary" disabled={!ready || !draft.queue} onClick={() => { void save(); }}><Save />Salvar rascunho</button><button className="button primary" disabled={!ready || !draft.queue || !!draft.order.submissionId} onClick={() => document.getElementById('review-order')?.click()}>Revisar pedido</button></div></header>
    <div className="preview-notice" role="note"><div><Info size={16} /><strong>Entrada rápida · Etapa 6</strong><span>F2: cliente · F4: produto · Ctrl+S: salvar · Ctrl+Enter: revisar envio. Dados fictícios, salvos neste navegador.</span></div></div>
    {draft.phase === 'loading' && <section className="recovery-card" role="status">Verificando rascunhos salvos neste navegador…</section>}
    {draft.phase === 'recovery' && <section className="recovery-card" aria-labelledby="recovery-title"><h2 id="recovery-title">Encontramos pedidos salvos</h2><p>Continue o rascunho salvo ou comece outro. Os rascunhos anteriores serão preservados.</p><label htmlFor="draft-selection">Rascunho <select id="draft-selection" value={selected} onChange={e => setSelected(Number(e.target.value))}>{draft.candidates.map((record, index) => <option key={record.orderId} value={index}>{record.order.number || 'Sem número'} · {orderStatusLabel(record.order)} · {record.order.items.length} itens · {new Date(record.savedAt).toLocaleString('pt-BR')}</option>)}</select></label><div className="draft-actions"><button autoFocus className="button primary" onClick={() => draft.recover(draft.candidates[selected])}>Continuar pedido</button><button className="button secondary" onClick={draft.startNew}>Começar novo pedido de exemplo</button></div></section>}
    {draft.phase === 'unavailable' && <section className="recovery-card draft-error" role="alert"><h2>Não foi possível abrir os rascunhos</h2><p>{draft.loadError}</p><div className="draft-actions"><button className="button secondary" onClick={() => location.reload()}>Tentar novamente</button><button className="button secondary" onClick={draft.continueWithoutStorage}>Continuar apenas em memória</button></div></section>}
    {ready && <DraftStatus queue={draft.queue} save={draft.saveNow} exportOrder={draft.exportOrder} />}
    <p className="sr-only" role="status">{manualMessage}</p>
    <details className="workspace-diagnostics"><summary>Diagnósticos e testes</summary><a className="diagnostic-link" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/diagnostico-etapa5/`} target="_blank" rel="noopener noreferrer">Diagnóstico: testar idempotência e falhas de envio ↗</a><a className="diagnostic-link" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/diagnostico-etapa6/`} target="_blank" rel="noopener noreferrer">Diagnóstico da Etapa 6 ↗</a></details>
    <div className="workspace-columns" inert={!ready || !!draft.order.submissionId}><div className="order-main"><div className="details-grid"><OrderDetails fields={draft.fields} onChange={draft.patchFields} /><CustomerDetails fields={draft.fields} onChange={draft.patchFields} /></div><OrderDates fields={draft.fields} onChange={draft.patchFields} /><a className="diagnostic-link" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/diagnostico/`} target="_blank" rel="noopener noreferrer">Diagnóstico: testar 10 a 300 itens e autosave ↗</a><OrderItems items={draft.itemsState.items} onChange={draft.dispatch} /><OrderTabs fields={draft.fields} onChange={draft.patchFields} /><footer className="workspace-footer"><span><ShieldCheck size={14} />Ambiente fictício, sem conexão com o ERP.</span><span>900 produtos · 100 clientes · 5 vendedores</span></footer></div><aside className="order-aside" aria-label="Dados adicionais e totais"><OrderSummary totals={draft.itemsState.totals} /><AdditionalDetails fields={draft.fields} onChange={draft.patchFields} /></aside></div>
    {ready && <SubmissionPanel order={draft.order} getOrder={draft.getOrder} persist={draft.persistSubmission} available={!!draft.queue || !!previewItems} preview={!!previewItems} />}
  </main></div></SidebarProvider>;
}
