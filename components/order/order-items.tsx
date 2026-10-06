'use client';

import { Copy, Pencil, Plus, Search, Trash2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { demoItems, products } from '@/domain/mock-data';
import { itemTotalCents } from '@/domain/totals';
import type { OrderItem } from '@/types/order';
import { decimalMoney } from '@/utils/format';
import { Section, TextField, Unavailable } from './fields';

// Isolated insertion surface. The stage-2 autocomplete will live only here.
export function ItemEntry() {
  return <div className="item-entry"><div className="field product-field"><label htmlFor="product-entry">Produto</label><div className="product-input-wrap"><Search size={18} /><Input id="product-entry" className="form-input product-input" placeholder="Digite o código, EAN, nome ou marca do produto..." autoComplete="off" aria-describedby="entry-help" /></div></div><TextField label="Qtd." defaultValue="1" inputMode="decimal" className="quantity-field" /><TextField label="UN" defaultValue="UN" readOnly className="unit-field" /><TextField label="Preço (R$)" defaultValue="0,00" inputMode="decimal" /><TextField label="Desc. (%)" defaultValue="0,00" inputMode="decimal" /><Unavailable className="add-unavailable" message="Inclusão de itens disponível na Etapa 2."><button className="button primary add-button" disabled><Plus size={18} />Adicionar</button></Unavailable></div>;
}

function ItemRow({ item, index }: { item: OrderItem; index: number }) {
  return <TableRow><TableCell className="index-cell">{String(index + 1).padStart(2, '0')}</TableCell><TableCell className="code-cell">{item.code}</TableCell><TableCell className="description-cell"><span className="product-name">{item.name}</span></TableCell><TableCell className="unit-cell">{item.unit}</TableCell><TableCell className="numeric quantity-cell">{item.quantity}</TableCell><TableCell className="numeric">{decimalMoney(item.unitPriceCents)}</TableCell><TableCell className="numeric discount-cell">{decimalMoney(item.discountBasisPoints)}</TableCell><TableCell className="numeric line-total">{decimalMoney(itemTotalCents(item))}</TableCell><TableCell><div className="row-actions"><button disabled title="Editar — disponível na Etapa 2" aria-label={`Editar ${item.name}`}><Pencil size={14} /></button><button disabled title="Duplicar — disponível na Etapa 2" aria-label={`Duplicar ${item.name}`}><Copy size={14} /></button><button disabled title="Excluir — disponível na Etapa 2" aria-label={`Excluir ${item.name}`} className="delete-action"><Trash2 size={14} /></button></div></TableCell></TableRow>;
}

export function OrderItems() {
  return <Section title="Itens do pedido" icon={<Package />} className="items-card" extra={<span className="catalog-count">{products.length} produtos no catálogo</span>}>
    <ItemEntry />
    <div className="items-table-wrap"><Table className="items-table" aria-label="Itens de demonstração do pedido"><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Código</TableHead><TableHead>Descrição do produto</TableHead><TableHead>UN</TableHead><TableHead className="numeric">Qtd.</TableHead><TableHead className="numeric">Preço un. (R$)</TableHead><TableHead className="numeric">Desc. (%)</TableHead><TableHead className="numeric">Total (R$)</TableHead><TableHead className="actions-heading">Ações</TableHead></TableRow></TableHeader><TableBody>{demoItems.map((item, index) => <ItemRow key={item.id} item={item} index={index} />)}</TableBody></Table></div>
    <div className="table-bottom"><span><strong>{demoItems.length} itens</strong> de demonstração</span><span id="entry-help">Busca e inclusão de itens na próxima etapa.</span></div>
  </Section>;
}
