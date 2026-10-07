'use client';

import { ChevronDown, Calculator, SlidersHorizontal } from 'lucide-react';
import { money, weight } from '@/utils/format';
import { ChoiceField, MoneyField, Section, TextField } from './fields';

import type { OrderTotals } from '@/types/order';
const taxes = ['IPI', 'ICMS ST + FCP ST', 'ICMS + FCP', 'PIS', 'COFINS', 'DIFAL', 'IBS Estadual', 'IBS Municipal', 'CBS'];

export function AdditionalDetails() {
  return <Section title="Dados adicionais" icon={<SlidersHorizontal />} className="additional-card"><div className="additional-fields"><ChoiceField label="Depósito" options={['Principal', 'Depósito auxiliar']} defaultValue="Principal" /><ChoiceField label="Intermediador" options={['Sem intermediador', 'Intermediador Exemplo']} defaultValue="Sem intermediador" /><div className="thin-divider" /><MoneyField label="Frete pago pelo cliente" readOnly /><MoneyField label="Frete pago pela empresa" readOnly /><MoneyField label="Despesas" readOnly /><TextField label="Desconto geral" defaultValue="0,00" suffix="%" readOnly /></div><p className="additional-note">Valores fixos nesta prévia.</p></Section>;
}

export function OrderSummary({ totals }: { totals: OrderTotals }) {
  return <Section title="Totais do pedido" icon={<Calculator />} className="totals-card">
    <dl className="totals-stats"><div><dt>Nº de itens</dt><dd>{totals.itemCount}</dd></div><div><dt>Quantidade total</dt><dd>{totals.quantity}</dd></div><div><dt>Peso bruto</dt><dd>{weight(totals.grossWeightGrams)}</dd></div><div><dt>Peso líquido</dt><dd>{weight(totals.netWeightGrams)}</dd></div></dl>
    <dl className="total-lines"><div><dt>Total produtos</dt><dd>{money(totals.productsCents)}</dd></div><div><dt>Frete e despesas</dt><dd>{money(0)}</dd></div><div><dt>Desconto geral</dt><dd>{money(0)}</dd></div></dl>
    <details className="tax-details"><summary><span>Impostos</span><span>{money(0)}<ChevronDown size={14} /></span></summary><dl>{taxes.map(tax => <div key={tax}><dt>{tax}</dt><dd>{money(0)}</dd></div>)}</dl><p>Sem cálculo fiscal nesta etapa.</p></details>
    <div className="grand-total"><span>Total da venda</span><strong>{money(totals.saleCents)}</strong><span className="grand-total-footnote">{totals.itemCount} itens · {totals.quantity} unidades</span></div>
  </Section>;
}
