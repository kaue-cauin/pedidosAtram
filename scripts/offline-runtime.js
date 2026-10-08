/* Generated during build. Cache is independent of the draft database. */
const ASSETS = __ASSETS__;
const VERSION = __VERSION__;
const PREFIX = `atram-offline-${new URL(self.registration.scope).pathname}-`;
const CACHE = PREFIX + VERSION;
const TEST_CACHE = `atram-network-test-${new URL(self.registration.scope).pathname}`;
const TEST_KEY = new URL('__offline_test__', self.registration.scope).href;
let testOffline;
async function offlineMode() {
  if (testOffline === undefined) testOffline = !!(await (await caches.open(TEST_CACHE)).match(TEST_KEY));
  return testOffline;
}
function result(response, blocked) {
  if (!blocked) return response;
  const headers = new Headers(response.headers); headers.set('X-Atram-Offline-Test', '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      // Refresh HTML across deploys even if the HTTP cache still considers it fresh.
      const resources = await Promise.all(ASSETS.map(async asset => {
        const url = new URL(asset, self.location.origin);
        if (url.pathname.endsWith('/')) url.searchParams.set('__atram_build', VERSION);
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (!response.ok) throw new Error(`Offline resource unavailable: ${asset}`);
        if (url.pathname.endsWith('/')) {
          const html = await response.clone().text();
          for (const match of html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)) {
            const referenced = new URL(match[1], url).pathname;
            if (!ASSETS.includes(referenced)) throw new Error('HTML and build assets belong to different deployments.');
          }
        }
        return [asset, response];
      }));
      const cache = await caches.open(CACHE);
      await Promise.all(resources.map(([asset, response]) => cache.put(asset, response)));
    } catch (error) { await caches.delete(CACHE); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith(PREFIX));
    // Keep the preceding version for chunks used by already-open tabs.
    for (const name of names.slice(0, -2)) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') { void self.skipWaiting(); return; }
  if (event.data?.type === 'SET_TEST_OFFLINE' || event.data?.type === 'GET_TEST_OFFLINE') event.waitUntil((async () => {
    if (event.data.type === 'SET_TEST_OFFLINE') {
      testOffline = !!event.data.offline;
      const cache = await caches.open(TEST_CACHE);
      if (testOffline) await cache.put(TEST_KEY, new Response('1')); else await cache.delete(TEST_KEY);
      for (const client of await self.clients.matchAll()) client.postMessage({ type: 'TEST_OFFLINE', offline: testOffline });
    }
    event.ports[0]?.postMessage({ offline: await offlineMode() });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const blocked = await offlineMode();
    const cache = await caches.open(CACHE);
    // HTML and build assets change together only when an installed update is activated.
    const key = event.request.mode === 'navigate' ? url.origin + url.pathname : event.request;
    const cached = await cache.match(key);
    if (cached) return result(cached, blocked);
    const names = (await caches.keys()).filter(name => name.startsWith(PREFIX));
    for (const name of names) { const old = await (await caches.open(name)).match(key); if (old) return result(old, blocked); }
    if (blocked) return new Response('Rede bloqueada pelo teste offline da Atram.', { status: 503, headers: { 'X-Atram-Offline-Test': '1' } });
    return fetch(event.request);
  })());
});
