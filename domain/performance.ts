import { products } from './mock-data.ts';
import { makeItem } from './item-entry.ts';
export const testSizes = [10, 50, 100, 150, 200, 300] as const;
export function performanceItems(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const p = products[i % products.length];
    return makeItem(p, String(i % 12 + 1), (p.priceCents / 100).toFixed(2), String(i % 4), `bench-${i}`);
  });
}
export function percentile(values: readonly number[], percent: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)];
}
