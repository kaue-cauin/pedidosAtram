'use client';

import { LocalAutocomplete } from './local-autocomplete';
import { createSearch, customerFields } from '@/domain/search';
import { useState } from 'react';
import { CalendarDays, ClipboardList, Users, MapPin } from 'lucide-react';
import { customers, demoOrder, priceLists, sellers } from '@/domain/mock-data';
import { ChoiceField, Section, TextField, Unavailable } from './fields';

export function OrderDetails() {
  return <Section title="Dados do pedido" icon={<ClipboardList />} className="details-card">
    <div className="details-fields"><ChoiceField label="Natureza da operação" options={['Venda de mercadorias', 'Bonificação']} defaultValue={demoOrder.operation} className="operation-field" /><TextField label="Nº do pedido" placeholder="Opcional" className="number-field" /><ChoiceField label="Lista de preço" options={priceLists.map(p => ({ value: p.id, label: p.name }))} defaultValue={demoOrder.priceListId} className="price-field" /></div>
    <div className="form-footnote">Valores de demonstração da lista Padrão.</div>
  </Section>;
}

const searchCustomers = createSearch(customers, customerFields);

export function CustomerDetails() {
  const [customerId, setCustomerId] = useState(demoOrder.customerId!);
  const [query, setQuery] = useState(customers.find(c => c.id === demoOrder.customerId)!.name);
  const customer = customers.find(c => c.id === customerId)!;
  return <Section title="Cliente e vendedor" icon={<Users />} className="customer-card">
    <div className="customer-fields"><LocalAutocomplete id="customer-search" label="Cliente *" placeholder="Nome, documento ou cidade…" value={query} search={searchCustomers} onChange={text => { setQuery(text); setCustomerId(''); }} onSelect={c => { setCustomerId(c.id); setQuery(c.name); document.getElementById('product-entry')?.focus(); }} render={c => <><strong>{c.name}</strong><span>{c.taxId} · {c.city} – {c.state}</span></>} /><ChoiceField label="Vendedor" options={sellers.map(s => ({ value: s.id, label: s.name }))} defaultValue={demoOrder.sellerId} /></div>
    <div className="customer-location"><MapPin size={13} /><span>{customer?.city ?? 'Selecione um cliente'} – {customer?.state ?? ''}</span><span className="mock-document">CNPJ fictício: {customer?.taxId ?? '—'}</span></div>
    <div className="customer-links">{['Dados do cliente', 'Limite de crédito', 'Últimas vendas'].map(label => <Unavailable key={label} message={`${label}: recurso ilustrativo nesta etapa.`}><button disabled className="text-link">{label}</button></Unavailable>)}</div>
  </Section>;
}

export function OrderDates() {
  return <Section title="Datas" icon={<CalendarDays />} className="dates-card"><div className="dates-fields"><TextField label="Data da venda *" type="date" defaultValue={demoOrder.saleDate} /><TextField label="Previsão de entrega" type="date" /><TextField label="Data de envio" type="date" /></div></Section>;
}
