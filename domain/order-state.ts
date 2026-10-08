import type { OrderItem, OrderTotals } from '../types/order';
import { itemTotalCents } from './totals.ts';

export interface ItemsState { items: readonly OrderItem[]; totals: OrderTotals }
export type ItemChange = { type: 'add'; item: OrderItem } | { type: 'edit'; item: OrderItem } | { type: 'delete'; id: string } | { type: 'replace'; items: readonly OrderItem[] };
const emptyTotals = (): OrderTotals => ({ itemCount: 0, quantity: 0, grossWeightGrams: 0, netWeightGrams: 0, productsCents: 0, discountCents: 0, saleCents: 0 });
// Thousandths preserve exact quantities/weights during repeated add/remove cycles.
const round3 = (value: number) => Math.round(value * 1000) / 1000;
function contribution(totals: OrderTotals, item: OrderItem, sign: 1 | -1): OrderTotals {
  const productsCents = totals.productsCents + sign * itemTotalCents(item);
  return { ...totals, itemCount: totals.itemCount + sign, quantity: round3(totals.quantity + sign * item.quantity), grossWeightGrams: round3(totals.grossWeightGrams + sign * item.quantity * item.grossWeightGrams), netWeightGrams: round3(totals.netWeightGrams + sign * item.quantity * item.netWeightGrams), productsCents, saleCents: productsCents };
}
export function initialItemsState(items: readonly OrderItem[]): ItemsState {
  return { items, totals: items.reduce((totals, item) => contribution(totals, item, 1), emptyTotals()) };
}
export function changeItems(state: ItemsState, action: ItemChange, incremental = true): ItemsState {
  if (action.type === 'replace') return initialItemsState(action.items);
  let items: readonly OrderItem[];
  let previous: OrderItem | undefined;
  let next: OrderItem | undefined;
  if (action.type === 'add') {
    if (state.items.some(item => item.id === action.item.id)) throw new Error('ID de item duplicado.');
    items = [...state.items, action.item]; next = action.item;
  } else {
    const index = state.items.findIndex(item => item.id === (action.type === 'edit' ? action.item.id : action.id));
    if (index === -1) return state;
    previous = state.items[index];
    if (action.type === 'delete') items = state.items.filter((_, i) => i !== index);
    else { items = state.items.slice(); (items as OrderItem[])[index] = action.item; next = action.item; }
  }
  if (!incremental) return initialItemsState(items);
  return { items, totals: updateItemTotals(state.totals, previous, next) };
}
// Order-level freight/discount are fixed at zero in stages 1–4.
export function updateItemTotals(totals: OrderTotals, previous?: OrderItem, next?: OrderItem): OrderTotals {
  let result = previous ? contribution(totals, previous, -1) : totals;
  if (next) result = contribution(result, next, 1);
  return result;
}

export const itemsReducer = (state: ItemsState, action: ItemChange) => changeItems(state, action);
