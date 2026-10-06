import assert from 'node:assert/strict';
import { products, customers, sellers, demoOrder, priceLists } from '../domain/mock-data.ts';
import { calculateTotals, itemTotalCents } from '../domain/totals.ts';

assert.equal(products.length, 900);
for (const key of ['id', 'code', 'ean']) assert.equal(new Set(products.map(product => product[key])).size, 900, `Produtos: ${key} deve ser único`);
for (const product of products) {
  assert.match(product.ean, /^\d{13}$/);
  const digits = [...product.ean].map(Number);
  const check = digits.slice(0, 12).reduce((sum, digit, i) => sum + digit * (i % 2 === 0 ? 1 : 3), 0);
  assert.equal(digits[12], (10 - check % 10) % 10);
  assert.ok(Number.isInteger(product.priceCents) && product.priceCents > 0);
  assert.ok(product.grossWeightGrams > product.netWeightGrams && product.netWeightGrams > 0);
  assert.equal(product.status, 'ACTIVE');
}
assert.equal(customers.length, 100);
assert.equal(new Set(customers.map(customer => customer.id)).size, 100);
assert.equal(sellers.length, 5);
assert.equal(priceLists.length, 3);
assert.equal(demoOrder.items.length, 10);
for (const item of demoOrder.items) assert.ok(products.some(product => product.id === item.productId));
const totals = calculateTotals(demoOrder);
assert.equal(totals.quantity, 75);
assert.equal(totals.saleCents, 124790);
assert.equal(totals.productsCents, demoOrder.items.reduce((sum, item) => sum + itemTotalCents(item), 0));
assert.equal(totals.netWeightGrams, 36405);
assert.equal(totals.grossWeightGrams, 39465);
console.log(JSON.stringify({ result: 'PASS', products: products.length, customers: customers.length, sellers: sellers.length, priceLists: priceLists.length, demoTotals: totals }, null, 2));
