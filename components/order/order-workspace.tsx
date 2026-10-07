'use client';

import { useEffect, useState } from 'react';
import { demoItems } from '@/domain/mock-data';
import type { OrderItem } from '@/types/order';
import { Eye, FilePenLine, Info, Save, Send, ShieldCheck } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Navigation, Topbar } from './navigation';
import { CustomerDetails, OrderDates, OrderDetails } from './order-details';
import { OrderItems } from './order-items';
import { AdditionalDetails, OrderSummary } from './order-summary';
import { OrderTabs } from './order-tabs';
import { Unavailable } from './fields';

export function OrderWorkspace() {
  const [items, setItems] = useState<readonly OrderItem[]>(demoItems);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key !== 'F2' && event.key !== 'F4') return;
      event.preventDefault(); document.getElementById(event.key === 'F2' ? 'customer-search' : 'product-entry')?.focus();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return <SidebarProvider className="app-shell"><a className="skip-link" href="#product-entry">Ir para os itens do pedido</a><Navigation /><div className="main-shell"><Topbar /><main id="novo-pedido" className="order-workspace"><header className="page-header"><div className="page-title"><div className="title-icon"><FilePenLine /></div><div><div className="title-line"><h1>Novo Pedido de Venda</h1><span className="draft-badge">Rascunho</span></div><p>Digite o pedido de forma rápida e eficiente</p></div></div><div className="page-actions"><Unavailable message="Salvar rascunho: disponível na Etapa 4."><button className="button secondary" disabled><Save />Salvar rascunho</button></Unavailable><Unavailable message="Pré-visualização do pedido: disponível na Etapa 5."><button className="button secondary" disabled><Eye />Pré-visualizar</button></Unavailable><Unavailable message="Envio simulado ao ERP: disponível na Etapa 5."><button className="button primary" disabled><Send />Enviar para o ERP</button></Unavailable></div></header>
    <div className="preview-notice" role="note"><div><Info size={16} /><strong>Entrada por teclado · Etapa 2</strong><span>F2: cliente · F4: produto. Alterações somente nesta sessão.</span></div><span className="unsaved-status"><FilePenLine size={14} />Rascunho não salvo</span></div>
    <div className="workspace-columns"><div className="order-main"><div className="details-grid"><OrderDetails /><CustomerDetails /></div><OrderDates /><OrderItems items={items} onChange={setItems} /><OrderTabs /><footer className="workspace-footer"><span><ShieldCheck size={14} />Ambiente fictício, sem conexão com o ERP.</span><span>900 produtos · 100 clientes · 5 vendedores</span></footer></div><aside className="order-aside" aria-label="Dados adicionais e totais"><OrderSummary items={items} /><AdditionalDetails /></aside></div>
  </main></div></SidebarProvider>;
}
