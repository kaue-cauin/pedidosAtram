import type { Product, Customer } from '../types/order';
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function createSearch<T>(values: readonly T[], fields: (value: T) => string, exact: (value: T) => string[] = () => []) {
  const index = values.map(value => ({ value, text: normalize(fields(value)), exact: exact(value).map(normalize) }));
  return (query: string, limit = 12): T[] => {
    const normalized = normalize(query);
    if (!normalized) return [];
    const words = normalized.split(/\s+/);
    const matches = index.filter(row => words.every(word => row.text.includes(word)));
    return [...matches.filter(row => row.exact.includes(normalized)), ...matches.filter(row => !row.exact.includes(normalized))].slice(0, limit).map(row => row.value);
  };
}
export const productFields = (p: Product) => `${p.code} ${p.ean} ${p.name} ${p.brand}`;
export const customerFields = (c: Customer) => `${c.code} ${c.name} ${c.taxId} ${c.city} ${c.state}`;
