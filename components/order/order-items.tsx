'use client';

import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createSearch, productFields } from '@/domain/search';
import type { ItemChange } from '@/domain/order-state';
import { makeItem } from '@/domain/item-entry';
import { LocalAutocomplete } from './local-autocomplete';
import type { Product } from '@/types/order';
import { Copy, Pencil, Plus, Trash2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { products } from '@/domain/mock-data';
import { itemTotalCents } from '@/domain/totals';
import type { OrderItem } from '@/types/order';
import { decimalMoney } from '@/utils/format';
import { Section } from './fields';

const searchProducts = createSearch(products.filter(p => p.status === 'ACTIVE'), productFields, p => [p.code, p.ean]);
const focusProduct = () => document.getElementById('product-entry')?.focus();

export function ItemEntry({ onSave, editing, onCancel }: { onSave: (item: OrderItem) => void; editing: OrderItem | null; onCancel: () => void }) {
  const [query, setQuery] = useState(editing?.name ?? '');
  const [product, setProduct] = useState<Product | null>(editing ? products.find(p => p.id === editing.productId)! : null);
  const [quantity, setQuantity] = useState(String(editing?.quantity ?? 1));
  const [price, setPrice] = useState(((editing?.unitPriceCents ?? 0) / 100).toFixed(2).replace('.', ','));
  const [discount, setDiscount] = useState(((editing?.discountBasisPoints ?? 0) / 100).toFixed(2).replace('.', ','));
  const [error, setError] = useState('');
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { qtyRef.current?.focus(); qtyRef.current?.select(); } }, [editing]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!product) { setError('Selecione um produto nas sugestões.'); focusProduct(); return; }
    try {
      const item = makeItem(product, quantity, price, discount, editing?.id ?? crypto.randomUUID());
      onSave(item); setProduct(null); setQuery(''); setQuantity('1'); setPrice('0,00'); setDiscount('0,00'); setError('');
      requestAnimationFrame(focusProduct);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <><form className="item-entry" onSubmit={submit} onKeyDown={event => { if (event.key === 'Escape' && editing) { onCancel(); requestAnimationFrame(focusProduct); } }}>
    <div className="product-field"><LocalAutocomplete id="product-entry" label={editing ? 'Editar produto' : 'Produto'} placeholder="Digite o código, EAN, nome ou marca do produto..." value={query} search={searchProducts}
      onChange={text => { setQuery(text); setProduct(null); setError(''); }}
      onSelect={selected => { setProduct(selected); setQuery(selected.name); setPrice((selected.priceCents / 100).toFixed(2).replace('.', ',')); setError(''); qtyRef.current?.focus(); qtyRef.current?.select(); }}
      render={p => <><strong>{p.name}</strong><span>{p.code} · {p.brand} · {p.unit} · R$ {decimalMoney(p.priceCents)}</span></>} /></div>
    <div className="field"><label htmlFor="item-quantity">Qtd.</label><Input id="item-quantity" ref={qtyRef} className="form-input" inputMode="decimal" value={quantity} onFocus={e => e.currentTarget.select()} onChange={e => setQuantity(e.target.value)} /></div>
    <div className="field"><label htmlFor="item-unit">UN</label><Input id="item-unit" className="form-input" readOnly tabIndex={-1} value={product?.unit ?? 'UN'} /></div>
    <div className="field"><label htmlFor="item-price">Preço (R$)</label><Input id="item-price" className="form-input" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
    <div className="field"><label htmlFor="item-discount">Desc. (%)</label><Input id="item-discount" className="form-input" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value)} /></div>
    <button className="button primary add-button" type="submit"><Plus size={18} />{editing ? 'Aplicar' : 'Adicionar'}</button>
    {editing && <button type="button" className="text-link" onClick={() => { onCancel(); requestAnimationFrame(focusProduct); }}>Cancelar edição</button>}
  </form>{error && <p className="entry-error" role="alert">{error}</p>}</>;
}

function ItemRow({ item, index, onEdit, onDuplicate, onDelete, onRowRender }: { onRowRender?: () => void; item: OrderItem; index: number; onEdit: (item: OrderItem) => void; onDuplicate: (item: OrderItem) => void; onDelete: (id: string) => void }) {
  onRowRender?.();
  return <TableRow><TableCell className="index-cell">{String(index + 1).padStart(2, '0')}</TableCell><TableCell className="code-cell">{item.code}</TableCell><TableCell className="description-cell"><span className="product-name">{item.name}</span></TableCell><TableCell className="unit-cell">{item.unit}</TableCell><TableCell className="numeric quantity-cell">{item.quantity}</TableCell><TableCell className="numeric">{decimalMoney(item.unitPriceCents)}</TableCell><TableCell className="numeric discount-cell">{decimalMoney(item.discountBasisPoints)}</TableCell><TableCell className="numeric line-total">{decimalMoney(itemTotalCents(item))}</TableCell><TableCell><div className="row-actions"><button onClick={() => onEdit(item)} title="Editar" aria-label={`Editar ${item.name}`}><Pencil size={14} /></button><button onClick={() => onDuplicate(item)} title="Duplicar" aria-label={`Duplicar ${item.name}`}><Copy size={14} /></button><button onClick={() => onDelete(item.id)} title="Excluir" aria-label={`Excluir ${item.name}`} className="delete-action"><Trash2 size={14} /></button></div></TableCell></TableRow>;
}

const MemoItemRow = memo(ItemRow);

export function OrderItems({ items, onChange, optimized = true, onRowRender }: { items: readonly OrderItem[]; onChange: (change: ItemChange) => void; optimized?: boolean; onRowRender?: () => void }) {
  const Row = optimized ? MemoItemRow : ItemRow;
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [message, setMessage] = useState('');
  function save(item: OrderItem) {
    onChange({ type: editing ? 'edit' : 'add', item });
    setMessage(`${item.name}: ${editing ? 'atualizado' : 'adicionado'}.`); setEditing(null);
  }
  const edit = useCallback((item: OrderItem) => { setEditing(item); }, []);
  const duplicate = useCallback((item: OrderItem) => { onChange({ type: 'add', item: { ...item, id: crypto.randomUUID() } }); setMessage(`${item.name}: duplicado.`); focusProduct(); }, [onChange]);
  const remove = useCallback((id: string) => { onChange({ type: 'delete', id }); setEditing(current => current?.id === id ? null : current); setMessage('Item excluído.'); requestAnimationFrame(focusProduct); }, [onChange]);

  return <Section title="Itens do pedido" icon={<Package />} className="items-card" extra={<span className="catalog-count">{products.length} produtos no catálogo</span>}>
    <ItemEntry key={editing?.id ?? "new"} editing={editing} onSave={save} onCancel={() => setEditing(null)} />
    <div className="items-table-wrap"><Table className="items-table" aria-label="Itens do pedido"><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Código</TableHead><TableHead>Descrição do produto</TableHead><TableHead>UN</TableHead><TableHead className="numeric">Qtd.</TableHead><TableHead className="numeric">Preço un. (R$)</TableHead><TableHead className="numeric">Desc. (%)</TableHead><TableHead className="numeric">Total (R$)</TableHead><TableHead className="actions-heading">Ações</TableHead></TableRow></TableHeader><TableBody>{items.map((item, index) => <Row key={item.id} item={item} index={index} onEdit={edit} onDuplicate={duplicate} onDelete={remove} onRowRender={onRowRender} />)}</TableBody></Table></div>
    <p className="sr-only" role="status">{message}</p><div className="table-bottom"><span><strong>{items.length} itens</strong></span><span id="entry-help">Produto → Enter → Quantidade → Enter · F4: produto</span></div>
  </Section>;
}
