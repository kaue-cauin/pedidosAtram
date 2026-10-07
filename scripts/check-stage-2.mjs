import assert from 'node:assert/strict';
import { products, customers, demoOrder } from '../domain/mock-data.ts';
import { createSearch, productFields, customerFields } from '../domain/search.ts';
import { makeItem, parseDecimal } from '../domain/item-entry.ts';
import { calculateTotals } from '../domain/totals.ts';
const search = createSearch(products, productFields, p => [p.code, p.ean]);
for (const [query, expected] of [['gran zero', 'Granola Zero'], ['ZERO GRAN', 'Granola Zero'], ['whey choc', 'Whey Protein Chocolate'], ['acucar coco', 'Açúcar de Coco'], ['far aveia', 'Farinha de Aveia']]) {
  assert.ok(search(query)[0].name.includes(expected), query);
}
for (const p of products) {
  assert.equal(search(p.code)[0].id, p.id);
  assert.equal(search(p.ean)[0].id, p.id);
}
assert.ok(search('raiz serra').every(p => p.brand === 'Raiz da Serra'));
assert.equal(search('produto inexistente').length, 0);
assert.equal(search('   ').length, 0);
assert.ok(search('a').length <= 12);
const customerSearch = createSearch(customers, customerFields);
assert.ok(customerSearch('mercado').length > 0);
assert.equal(customerSearch(customers[0].code)[0].id, customers[0].id);
assert.equal(parseDecimal('1,25', 3), 1.25);
for (const quantity of ['', '0', '-1', 'NaN', '1abc', '1000000']) assert.throws(() => makeItem(products[0], quantity, '18,90', '0', 'test'));
assert.throws(() => makeItem(products[0], '1', '18,90', '101', 'test'));
assert.throws(() => makeItem(products[0], '1', '1.234,56', '0', 'test'));
const item = makeItem(products[0], '10', '18,90', '10', 'test');
assert.equal(item.unitPriceCents, 1890);
assert.equal(item.discountBasisPoints, 1000);
const before = calculateTotals(demoOrder);
const after = calculateTotals({ ...demoOrder, items: [...demoOrder.items, item] });
assert.equal(after.itemCount, before.itemCount + 1);
assert.equal(after.quantity, before.quantity + 10);
assert.equal(after.saleCents, before.saleCents + 17010);
const timings = [];
for (let i = 0; i < 1000; i++) {
  const start = performance.now(); search(['gran zero', 'whey choc', 'acucar coco', 'far aveia'][i % 4]); timings.push(performance.now() - start);
}
timings.sort((a,b) => a-b);
console.log(JSON.stringify({ result: 'PASS', products: products.length, exactLookups: 1800, searchSamples: 1000, searchP50Ms: timings[500], searchP95Ms: timings[950], note: 'Busca pura em Node; não mede pintura, teclado ou renderização no navegador.' }, null, 2));

const scenario = [['gran zero', '10'], ['whey choc', '4'], ['acucar coco', '12'], ['far aveia', '5']].map(([query, qty], index) => {
 const p = search(query)[0]; return makeItem(p, qty, (p.priceCents / 100).toFixed(2), '0', `scenario-${index}`);
});
const scenarioTotals = calculateTotals({ ...demoOrder, items: [...demoOrder.items, ...scenario] });
assert.equal(scenarioTotals.itemCount, 14);
assert.equal(scenarioTotals.quantity, 106);
assert.equal(scenarioTotals.saleCents, 199980);
console.log('Roteiro de 4 inclusões: PASS; 14 linhas, 106 unidades, R$ 1.999,80.');
