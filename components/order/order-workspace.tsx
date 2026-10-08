'use client';

import { useEffect, useState } from 'react';
import { useDraftOrder } from '@/hooks/use-draft-order';
import { Eye, FilePenLine, Info, Save, Send, ShieldCheck } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Navigation, Topbar } from './navigation';
import { CustomerDetails, OrderDates, OrderDetails } from './order-details';
import { OrderItems } from './order-items';
import { AdditionalDetails, OrderSummary } from './order-summary';
import { OrderTabs } from './order-tabs';
import { DraftStatus } from './draft-status';
import { Unavailable } from './fields';

export function OrderWorkspace() {
  const draft = useDraftOrder();
  const [selected, setSelected] = useState(0);
  const [manualMessage, setManualMessage] = useState('');
  const ready = draft.phase === 'ready';
  useEffect(() => { if (ready) document.getElementById('product-entry')?.focus(); }, [ready]);
  async function save() {
    try { await draft.saveNow(); setManualMessage('Rascunho salvo localmente.'); }
    catch (error) { setManualMessage((error as Error).message); }
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!ready) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); return; }
      if (event.key !== 'F2' && event.key !== 'F4') return;
      event.preventDefault(); document.getElementById(event.key === 'F2' ? 'customer-search' : 'product-entry')?.focus();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });
  return <SidebarProvider className="app-shell"><a className="skip-link" href="#product-entry">Ir para os itens do pedido</a><Navigation /><div className="main-shell"><Topbar /><main id="novo-pedido" className="order-workspace"><header className="page-header"><div className="page-title"><div className="title-icon"><FilePenLine /></div><div><div className="title-line"><h1>Novo Pedido de Venda</h1><span className="draft-badge">Rascunho</span></div><p>Digite o pedido de forma rápida e eficiente</p></div></div><div className="page-actions"><button className="button secondary" disabled={!ready || !draft.queue} onClick={() => { void save(); }}><Save />Salvar rascunho</button><Unavailable message="Pré-visualização do pedido: disponível na Etapa 5."><button className="button secondary" disabled><Eye />Pré-visualizar</button></Unavailable><Unavailable message="Envio simulado ao ERP: disponível na Etapa 5."><button className="button primary" disabled><Send />Enviar para o ERP</button></Unavailable></div></header>
    <div className="preview-notice" role="note"><div><Info size={16} /><strong>Entrada rápida · Etapa 4</strong><span>F2: cliente · F4: produto · Ctrl+S: salvar. Dados fictícios, salvos neste navegador.</span></div></div>
    {draft.phase === 'loading' && <section className="recovery-card" role="status">Verificando rascunhos salvos neste navegador…</section>}
    {draft.phase === 'recovery' && <section className="recovery-card" aria-labelledby="recovery-title"><h2 id="recovery-title">Encontramos um pedido não finalizado</h2><p>Continue o rascunho salvo ou comece outro. Os rascunhos anteriores serão preservados.</p><label htmlFor="draft-selection">Rascunho <select id="draft-selection" value={selected} onChange={e => setSelected(Number(e.target.value))}>{draft.candidates.map((record, index) => <option key={record.orderId} value={index}>{record.order.number || 'Sem número'} · {record.order.items.length} itens · {new Date(record.savedAt).toLocaleString('pt-BR')}</option>)}</select></label><div className="draft-actions"><button autoFocus className="button primary" onClick={() => draft.recover(draft.candidates[selected])}>Continuar pedido</button><button className="button secondary" onClick={draft.startNew}>Começar novo pedido de exemplo</button></div></section>}
    {draft.phase === 'unavailable' && <section className="recovery-card draft-error" role="alert"><h2>Não foi possível abrir os rascunhos</h2><p>{draft.loadError}</p><div className="draft-actions"><button className="button secondary" onClick={() => location.reload()}>Tentar novamente</button><button className="button secondary" onClick={draft.continueWithoutStorage}>Continuar apenas em memória</button></div></section>}
    {ready && <DraftStatus queue={draft.queue} save={draft.saveNow} exportOrder={draft.exportOrder} />}
    <p className="sr-only" role="status">{manualMessage}</p>
    <div className="workspace-columns" inert={!ready}><div className="order-main"><div className="details-grid"><OrderDetails fields={draft.fields} onChange={draft.patchFields} /><CustomerDetails fields={draft.fields} onChange={draft.patchFields} /></div><OrderDates fields={draft.fields} onChange={draft.patchFields} /><a className="diagnostic-link" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/diagnostico/`} target="_blank" rel="noopener noreferrer">Diagnóstico: testar 10 a 300 itens e autosave ↗</a><OrderItems items={draft.itemsState.items} onChange={draft.dispatch} /><OrderTabs fields={draft.fields} onChange={draft.patchFields} /><footer className="workspace-footer"><span><ShieldCheck size={14} />Ambiente fictício, sem conexão com o ERP.</span><span>900 produtos · 100 clientes · 5 vendedores</span></footer></div><aside className="order-aside" aria-label="Dados adicionais e totais"><OrderSummary totals={draft.itemsState.totals} /><AdditionalDetails fields={draft.fields} onChange={draft.patchFields} /></aside></div>
  </main></div></SidebarProvider>;
}
