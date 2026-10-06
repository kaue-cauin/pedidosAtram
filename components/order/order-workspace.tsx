'use client';

import { Eye, FilePenLine, Info, Save, Send, ShieldCheck } from 'lucide-react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Navigation, Topbar } from './navigation';
import { CustomerDetails, OrderDates, OrderDetails } from './order-details';
import { OrderItems } from './order-items';
import { AdditionalDetails, OrderSummary } from './order-summary';
import { OrderTabs } from './order-tabs';
import { Unavailable } from './fields';

export function OrderWorkspace() {
  return <SidebarProvider className="app-shell"><a className="skip-link" href="#product-entry">Ir para os itens do pedido</a><Navigation /><div className="main-shell"><Topbar /><main id="novo-pedido" className="order-workspace"><header className="page-header"><div className="page-title"><div className="title-icon"><FilePenLine /></div><div><div className="title-line"><h1>Novo Pedido de Venda</h1><span className="draft-badge">Rascunho</span></div><p>Digite o pedido de forma rápida e eficiente</p></div></div><div className="page-actions"><Unavailable message="Salvar rascunho: disponível na Etapa 4."><button className="button secondary" disabled><Save />Salvar rascunho</button></Unavailable><Unavailable message="Pré-visualização do pedido: disponível na Etapa 5."><button className="button secondary" disabled><Eye />Pré-visualizar</button></Unavailable><Unavailable message="Envio simulado ao ERP: disponível na Etapa 5."><button className="button primary" disabled><Send />Enviar para o ERP</button></Unavailable></div></header>
    <div className="preview-notice" role="note"><div><Info size={16} /><strong>Prévia visual · Etapa 1</strong><span>Explore os campos e as abas. As alterações não serão salvas.</span></div><span className="unsaved-status"><FilePenLine size={14} />Rascunho não salvo</span></div>
    <div className="workspace-columns"><div className="order-main"><div className="details-grid"><OrderDetails /><CustomerDetails /></div><OrderDates /><OrderItems /><OrderTabs /><footer className="workspace-footer"><span><ShieldCheck size={14} />Ambiente fictício, sem conexão com o ERP.</span><span>900 produtos · 100 clientes · 5 vendedores</span></footer></div><aside className="order-aside" aria-label="Dados adicionais e totais"><OrderSummary /><AdditionalDetails /></aside></div>
  </main></div></SidebarProvider>;
}
