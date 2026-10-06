'use client';

import { BarChart3, ClipboardList, FilePlus2, Package, RefreshCw, Settings2, Users, ShoppingBasket, ChevronDown, PanelLeft } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

const navigation = [
  { label: 'Novo Pedido', icon: FilePlus2 }, { label: 'Pedidos', icon: ClipboardList },
  { label: 'Clientes', icon: Users }, { label: 'Produtos', icon: Package },
  { label: 'Sincronização', icon: RefreshCw }, { label: 'Relatórios', icon: BarChart3 },
  { label: 'Configurações', icon: Settings2 },
];

export function Navigation() {
  return <Sidebar className="app-sidebar" collapsible="offcanvas">
    <SidebarHeader className="brand-header"><a href="#novo-pedido" className="brand" aria-label="Atram Comercial — Novo Pedido"><span className="brand-symbol"><ShoppingBasket strokeWidth={1.8} /></span><span><strong>atram<span>.</span></strong><small>COMERCIAL</small></span></a></SidebarHeader>
    <SidebarContent><nav aria-label="Navegação principal" className="side-navigation"><div className="navigation-caption">ÁREA COMERCIAL</div><SidebarMenu>{navigation.map(({ label, icon: Icon }, index) => <SidebarMenuItem key={label}><SidebarMenuButton className="navigation-item" isActive={index === 0} disabled={index !== 0} title={index === 0 ? 'Novo Pedido' : 'Módulo fora do escopo da Etapa 1'} asChild={index === 0}>{index === 0 ? <a href="#novo-pedido" aria-current="page"><Icon /><span>{label}</span><span className="active-mark" /></a> : <><Icon /><span>{label}</span></>}</SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarContent>
    <SidebarFooter className="sidebar-bottom"><div className="environment-card"><span className="environment-mark">01</span><div><strong>Ambiente de demonstração</strong><span>Etapa 1 · Interface e dados</span></div></div><div className="sidebar-signature">Atram Comercial<span>Pedidos de venda</span></div></SidebarFooter>
  </Sidebar>;
}

export function Topbar() {
  const { toggleSidebar } = useSidebar();
  return <div className="topbar"><div className="breadcrumb"><button className="mobile-menu" onClick={toggleSidebar} aria-label="Abrir menu"><PanelLeft size={19} /></button><span>Comercial</span><span className="breadcrumb-slash">/</span><strong>Novo pedido</strong></div><div className="topbar-right"><span className="demo-pill">Dados fictícios</span><span className="topbar-divider" /><div className="profile"><span className="avatar">AC</span><span className="profile-name"><strong>Ana Costa</strong><small>Equipe comercial · demonstração</small></span></div><ChevronDown size={14} className="profile-chevron" /></div></div>;
}
