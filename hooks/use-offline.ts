'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
const subscribeOnline = (notify: () => void) => { window.addEventListener('online',notify); window.addEventListener('offline',notify); return () => { window.removeEventListener('online',notify); window.removeEventListener('offline',notify); }; };
export function useOffline() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [cacheState, setCacheState] = useState<'preparing' | 'ready' | 'unavailable'>('preparing');
  const [testOffline, setTestOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    let cancelled = false;
    const testMode = (event: MessageEvent) => { if (event.data?.type === 'TEST_OFFLINE') setTestOffline(!!event.data.offline); };
    navigator.serviceWorker?.addEventListener('message', testMode);
    let registration: ServiceWorkerRegistration | undefined;
    const inspect = () => {
      if (cancelled || !registration) return;
      setWaiting(registration.waiting);
      if (registration.active) setCacheState('ready');
    };
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') { queueMicrotask(() => { if (!cancelled) setCacheState('unavailable'); }); }
    else {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      void navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: 'none' }).then(r => {
        if (cancelled) return;
        registration = r; inspect();
        r.addEventListener('updatefound', () => { const worker = r.installing; worker?.addEventListener('statechange', () => { inspect(); if (worker.state === 'redundant' && !r.active) setCacheState('unavailable'); }); });
        void navigator.serviceWorker.ready.then(() => { if (!cancelled) { setCacheState('ready'); inspect(); const channel = new MessageChannel(); channel.port1.onmessage = event => { channel.port1.close(); if (!cancelled) setTestOffline(!!event.data.offline); }; registration?.active?.postMessage({ type: 'GET_TEST_OFFLINE' }, [channel.port2]); } });
      }).catch(() => { if (!cancelled) setCacheState('unavailable'); });
    }
    navigator.serviceWorker?.addEventListener('controllerchange', inspect);
    return () => { cancelled = true; navigator.serviceWorker?.removeEventListener('controllerchange', inspect); navigator.serviceWorker?.removeEventListener('message', testMode); };
  }, []);
  async function applyUpdate(save: () => Promise<unknown>) {
    await save();
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  }
  return { online, testOffline, cacheState, waiting, applyUpdate };
}
