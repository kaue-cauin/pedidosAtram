'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { OrderItems } from './order-items';
import { OrderSummary } from './order-summary';
import { changeItems, initialItemsState, type ItemChange } from '@/domain/order-state';
import { performanceItems, percentile, testSizes } from '@/domain/performance';
import { demoOrder } from '@/domain/mock-data';
import { DraftRepository, type PersistenceSimulation } from '@/repositories/draft-repository';
import { AutosaveQueue, type AutosaveState, type SaveMetrics } from '@/services/autosave-queue';
import type { Order } from '@/types/order';

type UiSample = { commitMs: number; modelMs: number; rows: number };
type Result = { size: number; autosave: boolean; network: string; storageDelayMs: number; operation: string; samples: number; modelP95: number; uiP50: number; uiP95: number; rows: number; saveSamples: number; indexedDbP95?: number; persistenceP95?: number; autosaveP95?: number; recovered: boolean };
const empty: AutosaveState = { phase: 'idle', dirty: false };
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;
function PersistenceStatus({ queue }: { queue?: AutosaveQueue<Order> }) {
  const state = useSyncExternalStore(queue?.subscribe ?? noopSubscribe, queue?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return <p role="status">Persistência do laboratório: {state.phase} {state.dirty ? '· alterações pendentes' : ''}{state.error && ` · ${state.error}`}</p>;
}
export function PersistenceLab() {
  const [snapshot, setSnapshot] = useState(() => initialItemsState(performanceItems(10)));
  const stateRef = useRef(snapshot);
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const [delay, setDelay] = useState(0);
  const [failure, setFailure] = useState(false);
  const simulationRef = useRef<PersistenceSimulation>({ delayMs: 0 });
  simulationRef.current = { delayMs: delay, failWrites: failure };
  const forcedSimulation = useRef<PersistenceSimulation | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Pronto. Os rascunhos deste teste usam outro banco e não alteram seu pedido.');
  const [stress, setStress] = useState<{ initialItems: number; additions: number; uiSamples: number; uiP95: number; storageDelayMs: number; savesDuringInput: number; actionsWhileSaving: number; indexedDbP95: number; persistenceP95: number; autosaveP95: number; recovered: boolean }>();
  const [results, setResults] = useState<Result[]>([]);
  const [queue, setQueue] = useState<AutosaveQueue<Order>>();
  const queueRef = useRef<AutosaveQueue<Order> | null>(null);
  const repositoryRef = useRef<DraftRepository | null>(null);
  const orderId = useRef('');
  const revision = useRef(0);
  const metrics = useRef<SaveMetrics[]>([]);
  const latestOrder = useRef<Order>(demoOrder);
  const cancelled = useRef(false);
  const rowCount = useRef(0);
  const pending = useRef<{ start: number; modelMs: number; resolve: (sample: UiSample) => void } | null>(null);
  const onRowRender = useCallback(() => { rowCount.current++; }, []);
  const onChange = useCallback((action: ItemChange) => {
    const next = changeItems(stateRef.current, action);
    stateRef.current = next; setSnapshot(next);
  }, []);
  useEffect(() => {
    orderId.current = crypto.randomUUID();
    const repository = new DraftRepository('atram-diagnostico-etapa4-v1', () => forcedSimulation.current ?? simulationRef.current);
    repositoryRef.current = repository;
    const autosave = new AutosaveQueue<Order>(async order => {
      const receipt = await repository.save(order, revision.current); revision.current = receipt.revision; return receipt;
    }, { onMetric: metric => metrics.current.push(metric) });
    queueRef.current = autosave; setQueue(autosave);
    return () => { cancelled.current = true; void autosave.flush().catch(() => {}).finally(() => { autosave.dispose(); void repository.close(); }); };
  }, []);
  useEffect(() => {
    latestOrder.current = { ...demoOrder, orderId: orderId.current, items: snapshot.items };
    if (enabledRef.current && queueRef.current && orderId.current) queueRef.current.schedule(latestOrder.current);
  }, [snapshot]);
  useLayoutEffect(() => {
    const p = pending.current; if (!p) return;
    pending.current = null;
    const sample = { commitMs: performance.now() - p.start, modelMs: p.modelMs, rows: rowCount.current };
    setTimeout(() => p.resolve(sample), 0); // DOM timing excludes this yield and all persistence.
  }, [snapshot]);
  async function commit(action: ItemChange): Promise<UiSample> {
    if (cancelled.current || document.visibilityState !== 'visible') throw new Error('Teste interrompido. Mantenha esta aba visível.');
    return new Promise((resolve, reject) => {
      const start = performance.now(); rowCount.current = 0;
      const next = changeItems(stateRef.current, action);
      const modelMs = performance.now() - start;
      const timeout = setTimeout(() => { pending.current = null; reject(new Error('Tempo limite da interface.')); }, 5000);
      pending.current = { start, modelMs, resolve: sample => { clearTimeout(timeout); resolve(sample); } };
      stateRef.current = next; setSnapshot(next);
    });
  }
  async function settled() {
    const autosave = queueRef.current!;
    // Keep normal debounce enabled. Do not replace background saves with immediate flushes.
    const start = performance.now();
    while (autosave.getSnapshot().dirty) {
      if (cancelled.current) throw new Error('Teste interrompido.');
      if (autosave.getSnapshot().phase === 'error') throw new Error(autosave.getSnapshot().error);
      if (performance.now() - start > 15000) throw new Error('Tempo limite do autosave.');
      await new Promise(r => setTimeout(r, 20));
    }
  }
  async function checkRecovery() {
    const reader = new DraftRepository('atram-diagnostico-etapa4-v1');
    try {
      const saved = (await reader.list()).find(record => record.orderId === orderId.current);
      if (!saved || JSON.stringify(saved.order) !== JSON.stringify(latestOrder.current)) throw new Error('A leitura independente não recuperou o último pedido.');
      return true;
    } finally { await reader.close(); }
  }
  async function run(networkSuite: boolean) {
    if (!queueRef.current) return;
    cancelled.current = false; setBusy(true); setResults([]);
    const original = stateRef.current; const originalEnabled = enabledRef.current;
    const collected: Result[] = [];
    try {
      await queueRef.current.flush();
      const scenarios = networkSuite ? ['Online', '50 ms', '100 ms', '300 ms', '1000 ms', 'Offline'] : ['Online'];
      for (const network of scenarios) for (const autosave of networkSuite ? [true] : [false, true]) for (const size of testSizes) {
        enabledRef.current = autosave; setEnabled(autosave);
        const fixture = performanceItems(size);
        const operations = networkSuite ? ['Adicionar'] : ['Adicionar', 'Quantidade', 'Excluir', 'Carregar tabela'];
        for (const operation of operations) {
          setStatus(`${network} · autosave ${autosave ? 'ligado' : 'desligado'} · ${size} itens · ${operation}…`);
          await commit({ type: 'replace', items: fixture });
          if (autosave) await settled();
          const firstMetric = metrics.current.length;
          // Independent simulated network request. It never gates the UI or IndexedDB.
          const networkProbe = network === 'Offline' ? Promise.resolve('offline') : new Promise<string>(r => setTimeout(() => r('ok'), Number.parseInt(network) || 0));
          const samples: UiSample[] = [];
          for (let i = 0; i < 12; i++) {
            await commit({ type: 'replace', items: fixture }); // fixture reset is outside measured UI sample
            const action: ItemChange = operation === 'Adicionar' ? { type: 'add', item: { ...fixture[0], id: `stage4-${size}-${i}` } }
              : operation === 'Quantidade' ? { type: 'edit', item: { ...fixture[0], quantity: i + 1.234 } }
              : operation === 'Excluir' ? { type: 'delete', id: fixture[Math.floor(size / 2)].id }
              : { type: 'replace', items: performanceItems(size) };
            const sample = await commit(action); if (i >= 2) samples.push(sample);
          }
          if (autosave) await settled();
          await networkProbe;
          const saves = metrics.current.slice(firstMetric);
          const recovered = autosave ? await checkRecovery() : false;
          collected.push({ size, autosave, network, storageDelayMs: simulationRef.current.delayMs, operation, samples: samples.length, modelP95: percentile(samples.map(x => x.modelMs), .95), uiP50: percentile(samples.map(x => x.commitMs), .5), uiP95: percentile(samples.map(x => x.commitMs), .95), rows: percentile(samples.map(x => x.rows), .5), saveSamples: saves.length,
            indexedDbP95: saves.length ? percentile(saves.map(x => x.indexedDbMs), .95) : undefined, persistenceP95: saves.length ? percentile(saves.map(x => x.persistenceMs), .95) : undefined, autosaveP95: saves.length ? percentile(saves.map(x => x.autosaveMs), .95) : undefined, recovered });
          setResults([...collected]);
        }
      }
      setStatus('Teste concluído. UI medida separadamente; o último estado foi recuperado por outra conexão IndexedDB em cada lote com autosave.');
    } catch (error) { setStatus((error as Error).message); }
    finally { pending.current = null; enabledRef.current = originalEnabled; setEnabled(originalEnabled); stateRef.current = original; setSnapshot(original); setBusy(false); }
  }
  async function testFailure() {
    if (!queueRef.current) return;
    setBusy(true);
    try {
      forcedSimulation.current = { delayMs: 0, failWrites: true };
      await queueRef.current.flush().catch(() => {});
      queueRef.current.schedule(latestOrder.current);
      await queueRef.current.flush().then(() => { throw new Error('Falha simulada não foi detectada.'); }, () => {});
      if (!queueRef.current.getSnapshot().dirty) throw new Error('Alterações foram descartadas após falha.');
      forcedSimulation.current = { delayMs: 0, failWrites: false };
      await queueRef.current.flush(); await checkRecovery();
      const expected = revision.current;
      const a = new DraftRepository('atram-diagnostico-etapa4-v1'), b = new DraftRepository('atram-diagnostico-etapa4-v1');
      try {
        const concurrent = await Promise.allSettled([a.save({ ...latestOrder.current, notes: 'Writer A' }, expected), b.save({ ...latestOrder.current, notes: 'Writer B' }, expected)]);
        if (concurrent.filter(r => r.status === 'fulfilled').length !== 1 || concurrent.filter(r => r.status === 'rejected').length !== 1) throw new Error('A proteção de concorrência falhou.');
        revision.current = expected + 1;
      } finally { await a.close(); await b.close(); }
      queueRef.current.schedule(latestOrder.current); await queueRef.current.flush(); await checkRecovery();
      setStatus('Falha, recuperação e concorrência passaram: alterações foram preservadas e recuperadas; duas conexões concorrentes permitiram somente uma gravação, impedindo sobrescrita.');
    } catch (error) { setStatus((error as Error).message); }
    finally { forcedSimulation.current = null; setBusy(false); }
  }
  async function continuousInput() {
    if (!queueRef.current) return;
    cancelled.current = false; setBusy(true); setStress(undefined);
    const original = stateRef.current, originalEnabled = enabledRef.current;
    try {
      await queueRef.current.flush(); enabledRef.current = true; setEnabled(true);
      forcedSimulation.current = { delayMs: 1000 };
      await commit({ type: 'replace', items: performanceItems(300) }); await settled();
      const firstMetric = metrics.current.length, start = performance.now();
      let actionsWhileSaving = 0;
      const samples: UiSample[] = [];
      for (let i = 0; i < 60; i++) {
        setStatus(`Digitação contínua: ${i + 1}/60 inclusões, gravação com atraso de 1.000 ms…`);
        if (queueRef.current.getSnapshot().phase === 'saving') actionsWhileSaving++;
        samples.push(await commit({ type: 'add', item: { ...stateRef.current.items[0], id: `continuous-${i}` } }));
        await new Promise(r => setTimeout(r, 50));
      }
      const end = performance.now(); await settled(); const recovered = await checkRecovery();
      const saves = metrics.current.slice(firstMetric);
      const result = { initialItems: 300, additions: 60, uiSamples: samples.length, uiP95: percentile(samples.map(s => s.commitMs), .95), storageDelayMs: 1000, savesDuringInput: saves.filter(m => m.completedAtMs >= start && m.completedAtMs <= end).length, actionsWhileSaving, indexedDbP95: percentile(saves.map(m => m.indexedDbMs), .95), persistenceP95: percentile(saves.map(m => m.persistenceMs), .95), autosaveP95: percentile(saves.map(m => m.autosaveMs), .95), recovered };
      if (!result.savesDuringInput || !actionsWhileSaving) throw new Error('Não houve sobreposição entre digitação e autosave; repita o teste.');
      setStress(result); setStatus('Digitação contínua passou: inclusão seguiu durante gravações lentas e o último pedido foi recuperado.');
    } catch (error) { setStatus((error as Error).message); }
    finally { forcedSimulation.current = null; pending.current = null; enabledRef.current = originalEnabled; setEnabled(originalEnabled); stateRef.current = original; setSnapshot(original); setBusy(false); }
  }
  function exportResults() {
    const payload = { recordedAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio }, method: '10 commits após 2 aquecimentos por operação. UI: modelo + React/DOM até useLayoutEffect, sem pintura. IndexedDB: transação até complete. Persistência: atraso artificial + abertura + transação. Autosave: última alteração do snapshot até complete, incluindo fila/debounce de 250 ms (máximo 1000 ms). Gravações coalescidas por lote, contagem separada de amostras UI. Rede simulada independente; Offline simulado não desliga a rede do navegador.', results, continuousInput: stress, saves: metrics.current };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'atram-performance-etapa4.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const n = (value?: number) => value === undefined ? '—' : value.toFixed(2);
  return <section className="persistence-lab"><h2>Etapa 4 · UI e persistência independentes</h2><p>Este pedido de teste tem autosave real em um banco IndexedDB separado. Os tempos da UI não incluem a espera por gravação. O lote usa o debounce normal; amostras de gravação são contadas separadamente.</p>
    <div className="lab-controls"><label>Linhas <select aria-label="Linhas do teste de autosave" disabled={busy} value={snapshot.items.length} onChange={e => onChange({ type: 'replace', items: performanceItems(Number(e.target.value)) })}>{!testSizes.some(n => n === snapshot.items.length) && <option>{snapshot.items.length}</option>}{testSizes.map(n => <option key={n}>{n}</option>)}</select></label>
    <label><input type="checkbox" checked={enabled} disabled={busy} onChange={e => { enabledRef.current = e.target.checked; setEnabled(e.target.checked); if (e.target.checked) queueRef.current?.schedule(latestOrder.current); }} /> Autosave ligado</label>
    <label>Atraso de armazenamento <select aria-label="Atraso artificial de persistência" value={delay} disabled={busy} onChange={e => setDelay(Number(e.target.value))}>{[0, 50, 100, 300, 1000].map(n => <option value={n} key={n}>{n} ms</option>)}</select></label>
    <label><input type="checkbox" checked={failure} disabled={busy} onChange={e => setFailure(e.target.checked)} /> Simular falha de gravação</label>
    <button className="button primary" disabled={busy || !queue} onClick={() => { void run(false); }}>Comparar UI com autosave</button><button className="button secondary" disabled={busy || !queue} onClick={() => { void run(true); }}>Testar rede lenta e offline simulados</button><button className="button secondary" disabled={busy || !queue} onClick={() => { void continuousInput(); }}>Testar digitação contínua (gravação 1 s)</button><button className="button secondary" disabled={busy || !queue} onClick={() => { void queueRef.current?.flush().then(() => checkRecovery()).then(() => setStatus('Pendências gravadas e recuperadas.')).catch(error => setStatus((error as Error).message)); }}>Salvar pendências agora</button><button className="button secondary" disabled={busy || !queue} onClick={() => { void testFailure(); }}>Testar falha e recuperação</button>{busy && <button className="button secondary" onClick={() => { cancelled.current = true; }}>Interromper</button>}<button className="button secondary" disabled={busy || (!results.length && !stress)} onClick={exportResults}>Exportar Etapa 4 JSON</button></div>
    <p role="status">{status}</p><PersistenceStatus queue={queue} />
    <p className="lab-explanation">Rede: operação simulada de 0/50/100/300/1000 ms ou indisponível, sem bloquear digitação e sem conexão com ERP. Atraso de armazenamento: teste independente para tornar uma gravação lenta. Recuperação automática usa uma nova conexão ao banco, não simula fechar o navegador. Para validar recarga offline real, abra o pedido principal após o indicador “Aplicação disponível offline”.</p>
    {stress && <p className="recovery-card" role="status">Digitação contínua: {stress.additions} inclusões a partir de {stress.initialItems} itens · UI p95 {stress.uiP95.toFixed(2)} ms · {stress.savesDuringInput} gravações concluídas durante a entrada · {stress.actionsWhileSaving} inclusões enquanto o escritor aguardava · Persistência p95 {stress.persistenceP95.toFixed(2)} ms · Recuperação {stress.recovered ? 'OK' : 'Falhou'}</p>}
    {results.length > 0 && <div className="lab-results"><table aria-label="Resultados da Etapa 4"><thead><tr>{['Autosave', 'Rede simulada', 'Itens', 'Operação', 'UI amostras', 'UI p95 ms', 'Gravações', 'IndexedDB p95 ms', 'Persistência p95 ms', 'Autosave p95 ms', 'Recuperação'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{results.map((r, i) => <tr key={i}><td>{r.autosave ? 'Ligado' : 'Desligado'}</td><td>{r.network}</td><td>{r.size}</td><td>{r.operation}</td><td>{r.samples}</td><td>{n(r.uiP95)}</td><td>{r.saveSamples}</td><td>{n(r.indexedDbP95)}</td><td>{n(r.persistenceP95)}</td><td>{n(r.autosaveP95)}</td><td>{r.autosave ? r.recovered ? 'OK' : 'Falhou' : '—'}</td></tr>)}</tbody></table></div>}
    <div className="lab-workspace" inert={busy}><OrderItems items={snapshot.items} onChange={onChange} onRowRender={onRowRender} /><OrderSummary totals={snapshot.totals} /></div>
  </section>;
}
