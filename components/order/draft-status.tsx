'use client';
import { useSyncExternalStore } from 'react';
import type { Order } from '@/types/order';
import type { AutosaveQueue, AutosaveState } from '@/services/autosave-queue';
import { useOffline } from '@/hooks/use-offline';
const empty: AutosaveState = { phase: 'idle', dirty: false };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;
// Its own subscription keeps persistence/network updates out of the item table.
export function DraftStatus({ queue, save, exportOrder }: { queue?: AutosaveQueue<Order>; save: () => Promise<unknown>; exportOrder: () => void }) {
  const state = useSyncExternalStore(queue?.subscribe ?? noopSubscribe, queue?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const network = useOffline();
  const label = !queue ? 'Autosave indisponível' : state.phase === 'error' ? 'Não foi possível salvar' : state.dirty ? 'Salvando…' : state.metrics ? 'Salvo localmente' : 'Rascunho recuperado';
  return <section className={`draft-status ${state.phase === 'error' || !queue ? 'draft-error' : ''}`} aria-label="Estado do rascunho"><div className="draft-status-line"><strong role="status">{network.testOffline ? `Rede bloqueada no teste — ${label.toLocaleLowerCase('pt-BR')}` : network.online ? label : `Sem conexão — ${label.toLocaleLowerCase('pt-BR')}`}</strong><span>{network.cacheState === 'ready' ? 'Aplicação disponível offline' : network.cacheState === 'preparing' ? 'Preparando acesso offline…' : 'Acesso offline ainda indisponível'}</span>{state.metrics && <span>Última gravação: {new Date(state.metrics.savedAt).toLocaleTimeString('pt-BR')}</span>}</div>
    {state.error && <p role="alert">{state.error}</p>}{!queue && <p>As alterações estão em memória. Exporte uma cópia antes de sair.</p>}
    {(state.phase === 'error' || !queue) && <div className="draft-actions">{queue && <button className="button secondary" onClick={() => { void save().catch(() => {}); }}>Tentar salvar novamente</button>}<button className="button secondary" onClick={exportOrder}>Exportar cópia do pedido</button></div>}
    {network.waiting && <div className="draft-actions"><span>Nova versão disponível.</span><button className="button secondary" disabled={!queue} onClick={() => { void network.applyUpdate(save).catch(() => {}); }}>Salvar e atualizar aplicação</button></div>}
    {state.metrics && <details className="draft-metrics"><summary>Tempos da última gravação</summary><span>IndexedDB: {state.metrics.indexedDbMs.toFixed(1)} ms · Persistência: {state.metrics.persistenceMs.toFixed(1)} ms · Autosave: {state.metrics.autosaveMs.toFixed(1)} ms (inclui fila e debounce)</span></details>}
  </section>;
}
