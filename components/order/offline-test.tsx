'use client';
import { useState } from 'react';
import { useOffline } from '@/hooks/use-offline';
export function OfflineTest() {
  const offline = useOffline();
  const [status, setStatus] = useState('O bloqueio abaixo vale apenas para esta aplicação; não altera as configurações de rede do navegador.');
  const [busy, setBusy] = useState(false);
  async function toggle(blocked: boolean) {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      await new Promise<void>((resolve, reject) => {
        const channel = new MessageChannel(); const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Tempo limite do teste offline.')); }, 5000);
        channel.port1.onmessage = () => { clearTimeout(timeout); channel.port1.close(); resolve(); };
        registration.active?.postMessage({ type: 'SET_TEST_OFFLINE', offline: blocked }, [channel.port2]);
      });
      if (blocked) {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        const cached = await fetch(`${base}/`);
        const uncached = await fetch(`${base}/__offline_probe__?time=${Date.now()}`);
        if (cached.status !== 200 || cached.headers.get('X-Atram-Offline-Test') !== '1' || uncached.status !== 503 || uncached.headers.get('X-Atram-Offline-Test') !== '1') throw new Error('O bloqueio de rede ou o cache não responderam como esperado.');
        setStatus('Rede bloqueada: página principal veio do cache (200); recurso não armazenado foi bloqueado (503). Abra o pedido, faça alterações e recarregue. Reative a rede ao terminar.');
      } else setStatus('Rede da aplicação reativada. O pedido continua salvo localmente.');
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="recovery-card"><h2>Recarga offline da aplicação</h2><p>Bloqueie a rede no service worker e teste uma recarga real do pedido. O bloqueio permanece entre recargas e afeta as abas desta aplicação. IndexedDB continua funcionando.</p><div className="draft-actions"><button className="button secondary" disabled={busy || offline.cacheState !== 'ready'} onClick={() => { void toggle(!offline.testOffline); }}>{offline.testOffline ? 'Reativar rede da aplicação' : 'Bloquear rede da aplicação para teste'}</button><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}>Abrir pedido para testar recuperação</a></div><p role="status">{status}</p></section>;
}
