import type { OrderItem, Product } from '../types/order';
export function parseDecimal(value: string, places: number): number | null {
  const trimmed = value.trim();
  if (!new RegExp(`^\\d+(?:[,.]\\d{1,${places}})?$`).test(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
export function makeItem(product: Product, quantityText: string, priceText: string, discountText: string, id: string): OrderItem {
  const quantity = parseDecimal(quantityText, 3);
  const price = parseDecimal(priceText, 2);
  const discount = parseDecimal(discountText, 2);
  if (quantity === null || quantity <= 0 || quantity > 999999) throw new Error('Informe uma quantidade entre 0,001 e 999999.');
  if (price === null || price > 9999999) throw new Error('Informe um preço válido, com até 2 casas decimais.');
  if (discount === null || discount > 100) throw new Error('Informe um desconto entre 0 e 100%.');
  return { id, productId: product.id, code: product.code, name: product.name, brand: product.brand, unit: product.unit, quantity, unitPriceCents: Math.round(price * 100), discountBasisPoints: Math.round(discount * 100), grossWeightGrams: product.grossWeightGrams, netWeightGrams: product.netWeightGrams };
}
