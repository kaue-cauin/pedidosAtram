'use client';

import { CreditCard, Link2, Percent, Landmark, FileText, Truck, MessageSquare, CircleDashed } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { demoOrder, paymentMethods, shippingMethods } from '@/domain/mock-data';
import { ChoiceField, TextField, Unavailable } from './fields';

const tabs = [
  { id: 'payment', label: 'Pagamento', icon: CreditCard },
  { id: 'integrated', label: 'Pagamento integrado', icon: Link2 },
  { id: 'commission', label: 'Comissões', icon: Percent },
  { id: 'taxes', label: 'Impostos', icon: Landmark },
  { id: 'new-taxes', label: 'Novos Tributos', icon: FileText },
  { id: 'shipping', label: 'Transportador / Volumes', icon: Truck },
  { id: 'notes', label: 'Observações', icon: MessageSquare },
];

export function OrderTabs() {
  return <Tabs defaultValue="payment" className="order-tabs section-card"><div className="tabs-scroll"><TabsList variant="line" className="order-tab-list" aria-label="Informações complementares do pedido">{tabs.map(({ id, label, icon: Icon }) => <TabsTrigger key={id} value={id} className="order-tab"><Icon />{label}</TabsTrigger>)}</TabsList></div>
    <TabsContent value="payment" forceMount className="order-tab-panel"><div className="payment-fields"><ChoiceField label="Forma de recebimento" options={paymentMethods} defaultValue={demoOrder.payment.method} /><ChoiceField label="Meio" options={['Banco', 'Carteira']} defaultValue="Banco" /><ChoiceField label="Conta bancária" options={['Itaú', 'Banco Exemplo']} defaultValue="Itaú" /><ChoiceField label="Categoria" options={['Vendas', 'Vendas a prazo']} defaultValue="Vendas" /></div><div className="payment-terms"><TextField label="Condição de pagamento" defaultValue={demoOrder.payment.terms} placeholder="Ex.: 30 60 90" /><Unavailable message="A geração de parcelas será implementada em uma etapa posterior."><button className="button secondary" disabled>Gerar parcelas</button></Unavailable><span>Exemplos: 30 · 30 60 · 3x · 15 + 2x</span></div></TabsContent>
    <TabsContent value="integrated" className="order-tab-panel"><div className="tab-placeholder"><CircleDashed /><div><strong>Pagamento integrado</strong><p>Área reservada. Nenhuma conexão com meios de pagamento nesta etapa.</p></div></div></TabsContent>
    <TabsContent value="commission" className="order-tab-panel"><div className="tab-placeholder"><Percent /><div><strong>Comissões</strong><p>Área reservada para as condições comerciais do vendedor.</p></div></div></TabsContent>
    <TabsContent value="taxes" className="order-tab-panel"><div className="tax-preview">{['IPI', 'ICMS ST + FCP ST', 'ICMS + FCP', 'PIS', 'COFINS', 'DIFAL'].map(tax => <TextField key={tax} label={tax} defaultValue="R$ 0,00" readOnly />)}</div><p className="form-footnote">Valores ilustrativos. Nenhum cálculo fiscal é realizado.</p></TabsContent>
    <TabsContent value="new-taxes" className="order-tab-panel"><div className="tax-preview">{['IBS Estadual', 'IBS Municipal', 'CBS'].map(tax => <TextField key={tax} label={tax} defaultValue="R$ 0,00" readOnly />)}</div><p className="form-footnote">Campos reservados para implementação futura.</p></TabsContent>
    <TabsContent value="shipping" forceMount className="order-tab-panel"><div className="shipping-fields"><ChoiceField label="Forma de envio" options={shippingMethods} defaultValue="Entrega própria" /><ChoiceField label="Forma de frete" options={['Normal', 'Expresso']} defaultValue="Normal" /><ChoiceField label="Frete por conta" options={['Remetente', 'Destinatário', 'Sem frete']} defaultValue="Remetente" /><TextField label="Transportadora" placeholder="Nome da transportadora" /><TextField label="Código de rastreamento" placeholder="Opcional" /><TextField label="URL de rastreamento" placeholder="https://" type="url" /><TextField label="Quantidade de volumes" defaultValue="1" type="number" min="1" /><label className="checkbox-label"><Checkbox id="dispatch" />Enviar para expedição</label></div></TabsContent>
    <TabsContent value="notes" forceMount className="order-tab-panel"><div className="notes-fields"><div className="field"><label htmlFor="public-notes">Observações</label><textarea id="public-notes" placeholder="Informações que acompanham o pedido..." rows={3} /></div><div className="field"><label htmlFor="internal-notes">Observações internas</label><textarea id="internal-notes" placeholder="Anotações para a equipe..." rows={3} /></div></div></TabsContent>
  </Tabs>;
}
