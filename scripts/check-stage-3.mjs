import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { changeItems, initialItemsState, updateItemTotals } from '../domain/order-state.ts';
import { performanceItems, testSizes, percentile } from '../domain/performance.ts';
import { calculateTotals } from '../domain/totals.ts';
import { demoOrder, products } from '../domain/mock-data.ts';
import { createSearch, productFields } from '../domain/search.ts';
const search = createSearch(products, productFields);
let assertions = 0;
function verify(state) {
  const reference = calculateTotals({ ...demoOrder, items: state.items });
  for (const key of Object.keys(reference)) { assert.ok(Math.abs(reference[key] - state.totals[key]) < .00001, `${key}: ${reference[key]} != ${state.totals[key]}`); assertions++; }
  assert.equal(new Set(state.items.map(i => i.id)).size, state.items.length);
}
for (const size of testSizes) {
  let state = initialItemsState(performanceItems(size));
  verify(state);
  const original = state;
  for (let i = 0; i < 600; i++) {
    const item = { ...state.items[i % state.items.length], id: `extra-${i}`, quantity: (i % 97 + 1) / 1000, discountBasisPoints: i % 2 ? 9999 : 1234 };
    state = changeItems(state, { type: 'add', item }); verify(state);
    const untouched = state.items[0];
    state = changeItems(state, { type: 'edit', item: { ...item, quantity: 1.234, unitPriceCents: 1999 } }); verify(state);
    assert.equal(state.items[0], untouched);
    state = changeItems(state, { type: 'delete', id: item.id }); verify(state);
  }
  assert.deepEqual(state.totals, original.totals);
  assert.equal(changeItems(state, { type: 'delete', id: 'missing' }), state);
  assert.throws(() => changeItems(state, { type: 'add', item: state.items[0] }));
  for (const item of [...state.items]) state = changeItems(state, { type: 'delete', id: item.id });
  assert.deepEqual(state, initialItemsState([]));
}
const results = [];
for (const size of testSizes) {
  const state = initialItemsState(performanceItems(size));
  const previous = state.items[Math.floor(size / 2)];
  const added = { ...previous, id: 'bench-added' };
  const edited = { ...previous, quantity: 25 };
  for (const fast of [false, true]) {
    for (const [operation, fn] of [
      ['Busca', () => search('gran zero')],
      ['Adicionar', () => changeItems(state, { type: 'add', item: added }, fast)],
      ['Quantidade', () => changeItems(state, { type: 'edit', item: edited }, fast)],
      ['Excluir', () => changeItems(state, { type: 'delete', id: previous.id }, fast)],
      ['Totais', () => fast ? updateItemTotals(state.totals, previous, edited) : initialItemsState(state.items.map(i => i.id === previous.id ? edited : i))],
    ]) {
      const durations = [];
      for (let i = 0; i < 1200; i++) { const start = performance.now(); fn(); if (i >= 200) durations.push(performance.now() - start); }
      results.push({ size, mode: fast ? 'Otimizado' : 'Base', operation, p50Ms: percentile(durations,.5), p95Ms: percentile(durations,.95) });
    }
  }
}
const report = { recordedAt: new Date().toISOString(), runtime: process.version, assertions, result: 'PASS', method: 'CPU pura em Node, 1000 amostras após 200 aquecimentos. Sem React/DOM/pintura.', results };
if (process.argv.includes('--report')) writeFileSync('docs/performance-node-etapa3.json', JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ result: report.result, assertions, sizes: testSizes, operationsChecked: 10800, benchmarkRows: results.length },null,2));
