'use client';

import { LocalAutocomplete } from './local-autocomplete';
import { createSearch, customerFields } from '@/domain/search';
import { memo, useEffect, useState } from 'react';
import type { OrderFields, FieldsChange } from '@/hooks/use-draft-order';
import { CalendarDays, ClipboardList, Users, MapPin } from 'lucide-react';
import { customers, priceLists, sellers } from '@/domain/mock-data';
import { ChoiceField, Section, TextField, Unavailable } from './fields';

export const OrderDetails = memo(function OrderDetails({ fields, onChange }: { fields: OrderFields; onChange: (patch: FieldsChange) => void }) {
  return <Section title="Dados do pedido" icon={<ClipboardList />} className="details-card">
    <div className="details-fields"><ChoiceField label="Natureza da operação" options={['Venda de mercadorias', 'Bonificação']} value={fields.operation} onValueChange={operation => onChange({ operation })} className="operation-field" /><TextField label="Nº do pedido" placeholder="Opcional" className="number-field" value={fields.number} onChange={e => onChange({ number: e.target.value })} /><ChoiceField label="Lista de preço" options={priceLists.map(p => ({ value: p.id, label: p.name }))} value={fields.priceListId} onValueChange={priceListId => onChange({ priceListId })} className="price-field" /></div>
    <div className="form-footnote">Valores de demonstração da lista Padrão.</div>
  </Section>;
});

const searchCustomers = createSearch(customers, customerFields);

export const CustomerDetails = memo(function CustomerDetails({ fields, onChange }: { fields: OrderFields; onChange: (patch: FieldsChange) => void }) {
  const [query, setQuery] = useState(() => customers.find(c => c.id === fields.customerId)?.name ?? '');
  useEffect(() => { if (fields.customerId) setQuery(customers.find(c => c.id === fields.customerId)?.name ?? ''); }, [fields.customerId]);
  const customer = customers.find(c => c.id === fields.customerId);
  return <Section title="Cliente e vendedor" icon={<Users />} className="customer-card">
    <div className="customer-fields"><LocalAutocomplete id="customer-search" label="Cliente *" placeholder="Nome, documento ou cidade…" value={query} search={searchCustomers} onChange={text => { setQuery(text); if (fields.customerId) onChange({ customerId: null }); }} onSelect={c => { onChange({ customerId: c.id }); setQuery(c.name); document.getElementById('product-entry')?.focus(); }} render={c => <><strong>{c.name}</strong><span>{c.taxId} · {c.city} – {c.state}</span></>} /><ChoiceField label="Vendedor" options={sellers.map(s => ({ value: s.id, label: s.name }))} value={fields.sellerId} onValueChange={sellerId => onChange({ sellerId })} /></div>
    <div className="customer-location"><MapPin size={13} /><span>{customer?.city ?? 'Selecione um cliente'} – {customer?.state ?? ''}</span><span className="mock-document">CNPJ fictício: {customer?.taxId ?? '—'}</span></div>
    <div className="customer-links">{['Dados do cliente', 'Limite de crédito', 'Últimas vendas'].map(label => <Unavailable key={label} message={`${label}: recurso ilustrativo nesta etapa.`}><button disabled className="text-link">{label}</button></Unavailable>)}</div>
  </Section>;
});

export const OrderDates = memo(function OrderDates({ fields, onChange }: { fields: OrderFields; onChange: (patch: FieldsChange) => void }) {
  return <Section title="Datas" icon={<CalendarDays />} className="dates-card"><div className="dates-fields"><TextField label="Data da venda *" type="date" value={fields.saleDate} onChange={e => onChange({ saleDate: e.target.value })} /><TextField label="Previsão de entrega" type="date" value={fields.deliveryDate} onChange={e => onChange({ deliveryDate: e.target.value })} /><TextField label="Data de envio" type="date" value={fields.shippingDate} onChange={e => onChange({ shippingDate: e.target.value })} /></div></Section>;
});
