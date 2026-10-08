import assert from 'node:assert/strict';
import { AutosaveQueue } from '../services/autosave-queue.ts';
import { validateDraft } from '../repositories/draft-repository.ts';
import { demoOrder } from '../domain/mock-data.ts';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let checks = 0;
const check = (a, b) => { assert.deepEqual(a, b); checks++; };
const record = { schemaVersion: 1, orderId: demoOrder.orderId, revision: 1, savedAt: new Date().toISOString(), order: demoOrder };
check(validateDraft(structuredClone(record)), record);
for (const broken of [ { ...record, schemaVersion: 99 }, { ...record, revision: 0 }, { ...record, order: { ...demoOrder, items: [...demoOrder.items, demoOrder.items[0]] } }, { ...record, order: { ...demoOrder, items: [{ ...demoOrder.items[0], quantity: NaN }] } }, { ...record, order: { ...demoOrder, shipping: {} } }, { ...record, order: { ...demoOrder, payment: {} } } ]) { assert.throws(() => validateDraft(broken)); checks++; }
const writes = [];
let simultaneous = 0, maxSimultaneous = 0;
const queue = new AutosaveQueue(async value => {
  simultaneous++; maxSimultaneous = Math.max(maxSimultaneous, simultaneous);
  writes.push(value); await sleep(25); simultaneous--;
  return { revision: writes.length, savedAt: new Date().toISOString(), indexedDbMs: 1, persistenceMs: 25 };
}, { debounceMs: 10, maxWaitMs: 35 });
// Burst coalescing; no adapter call on the scheduling stack.
for (let i = 0; i < 300; i++) queue.schedule({ version: i });
check(writes, []); check(queue.getSnapshot().dirty, true);
await sleep(5); check(writes.length, 0);
await queue.flush(); check(writes, [{ version: 299 }]); check(queue.getSnapshot().dirty, false);
// Update during an active write: newest snapshot wins, writers never overlap.
queue.schedule({ version: 300 }); const saving = queue.flush();
await sleep(5); queue.schedule({ version: 301 }); queue.schedule({ version: 302 });
await saving; check(writes.slice(1), [{ version: 300 }, { version: 302 }]); check(maxSimultaneous, 1);
// Sustained input cannot starve background persistence past maxWait.
const count = writes.length;
for (let i = 0; i < 15; i++) { queue.schedule({ version: 400 + i }); await sleep(5); }
assert.ok(writes.length > count); checks++;
await queue.flush(); check(writes.at(-1), { version: 414 });
assert.ok(queue.getSnapshot().metrics.autosaveMs >= queue.getSnapshot().metrics.queueMs); checks++;
queue.dispose(); queue.schedule({ version: 999 }); await sleep(15); check(writes.at(-1), { version: 414 });
// Failure retains dirty state, newest edits survive, explicit retry persists them.
let failing = true; const durable = [];
const errorQueue = new AutosaveQueue(async value => {
  await sleep(5); if (failing) throw new Error('quota');
  durable.push(value); return { revision: 1, savedAt: new Date().toISOString(), indexedDbMs: 5, persistenceMs: 5 };
}, { debounceMs: 5 });
errorQueue.schedule('old'); const failed = errorQueue.flush(); await sleep(1); errorQueue.schedule('latest');
await assert.rejects(failed, /quota/); checks++;
check(errorQueue.getSnapshot().phase, 'error'); check(errorQueue.getSnapshot().dirty, true);
await sleep(20); check(durable.length, 0);
failing = false; await errorQueue.flush(); check(durable, ['latest']); check(errorQueue.getSnapshot().dirty, false); errorQueue.dispose();
// Synchronous exceptions from a repository are also retained and surfaced.
const synchronous = new AutosaveQueue(() => { throw new Error('unavailable'); });
synchronous.schedule(1); await assert.rejects(synchronous.flush(), /unavailable/); checks++;
check(synchronous.getSnapshot().dirty, true); synchronous.dispose();
console.log(JSON.stringify({ result: 'PASS', checks, guarantees: ['schedule never calls adapter synchronously', 'burst coalescing', 'one writer', 'latest edit wins', 'maxWait', 'flush drains changes made in flight', 'errors retain dirty state', 'retry', 'schema and item validation'], browserChecksRequired: ['real IndexedDB transactions and concurrency', 'refresh/close recovery', 'service worker offline reload', 'UI and persistence timings'] }, null, 2));
