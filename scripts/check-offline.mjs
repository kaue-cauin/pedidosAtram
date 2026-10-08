import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile('out/sw.js', 'utf8');
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const origin = 'https://atram.test';
let networkDown = false, networkCalls = 0, skipWaiting = 0, checks = 0;
const stores = new Map();
const keyOf = value => new URL(typeof value === 'string' ? value : value.url, `${origin}${base}/`).href;
const fetchMock = async request => {
  networkCalls++;
  if (networkDown) throw new Error('Network offline');
  const path = new URL(keyOf(request)).pathname.slice(base.length);
  const file = 'out' + (path.endsWith('/') ? path + 'index.html' : path);
  return new Response(await readFile(file));
};
const caches = {
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async addAll(urls) { const responses = await Promise.all(urls.map(fetchMock)); for (let i=0;i<urls.length;i++) entries.set(keyOf(urls[i]), responses[i].clone()); },
      async put(key, value) { entries.set(keyOf(key), value.clone()); },
      async match(key) { return entries.get(keyOf(key))?.clone(); },
      async delete(key) { return entries.delete(keyOf(key)); },
    };
  },
};
function runtime() {
  const handlers = new Map();
  const self = { registration: { scope: `${origin}${base}/` }, location: { origin }, clients: { claim: async () => {}, matchAll: async () => [] }, skipWaiting: async () => { skipWaiting++; }, addEventListener: (event, handler) => handlers.set(event, handler) };
  vm.runInNewContext(source, { self, caches, fetch: fetchMock, URL, Response, Headers });
  return handlers;
}
let handlers = runtime();
let install; handlers.get('install')({ waitUntil: promise => { install = promise; } }); await install;
assert.equal(skipWaiting, 0); checks++;
const assets = JSON.parse(source.match(/const ASSETS = (.*);/)[1]);
assert.ok(assets.every(a => a.startsWith(`${base}/`))); checks++;
const request = async (url, navigate = false) => {
  let response; handlers.get('fetch')({ request: { url: keyOf(url), method: 'GET', mode: navigate ? 'navigate' : 'cors' }, respondWith: promise => { response = promise; } }); return response;
};
networkDown = true; const before = networkCalls;
for (const asset of assets) { const response = await request(asset, asset.endsWith('/')); assert.equal(response.status, 200); assert.ok((await response.arrayBuffer()).byteLength > 0); checks+=2; }
assert.equal(networkCalls, before); checks++;
assert.equal((await request(`${base}/?recovery=1`, true)).status, 200); checks++;
await assert.rejects(request(`${base}/not-cached`), /Network offline/); checks++;
networkDown = false;
let message; handlers.get('message')({ data: { type: 'SET_TEST_OFFLINE', offline: true }, ports: [{ postMessage: value => { message = value; } }], waitUntil: promise => { install = promise; } }); await install;
assert.equal(message.offline, true); checks++;
const probe = await request(`${base}/not-cached`); assert.equal(probe.status, 503); checks++;
assert.equal(probe.headers.get('X-Atram-Offline-Test'), '1'); checks++;
handlers = runtime(); // simulates service worker termination and restart with retained cache
assert.equal((await request(`${base}/not-cached`)).status, 503); checks++;
assert.equal((await request(`${base}/`, true)).headers.get('X-Atram-Offline-Test'), '1'); checks++;
handlers.get('message')({ data: { type: 'SET_TEST_OFFLINE', offline: false }, ports: [], waitUntil: promise => { install = promise; } }); await install;
assert.equal((await request(`${base}/`, true)).headers.get('X-Atram-Offline-Test'), null); checks++;
handlers.get('message')({ data: { type: 'ACTIVATE_UPDATE' } }); assert.equal(skipWaiting, 1); checks++;
console.log(JSON.stringify({ result: 'PASS', checks, cachedResources: assets.length, scope: base || '/', method: 'Generated service-worker runtime in VM, actual built resource bytes, network failure and worker restart simulated. Browser integration tested separately.' },null,2));
