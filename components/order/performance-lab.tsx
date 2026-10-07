'use client';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { OrderItems } from './order-items';
import { OrderSummary } from './order-summary';
import { changeItems, initialItemsState, updateItemTotals, type ItemChange } from '@/domain/order-state';
import { performanceItems, percentile, testSizes } from '@/domain/performance';
import { createSearch, productFields } from '@/domain/search';
import { products } from '@/domain/mock-data';

type Measurement = { commit: number; frame?: number; rows: number; model: number };
type Result = { size: number; mode: string; operation: string; samples: number; cpuP50: number; cpuP95: number; commitP95?: number; frameP50?: number; frameP95?: number; rows?: number };
const search = createSearch(products, productFields, p => [p.code, p.ean]);
const number = (n?: number) => n === undefined ? '—' : n.toFixed(2);
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export function PerformanceLab() {
  const [snapshot, setSnapshot] = useState(() => initialItemsState(performanceItems(10)));
  const stateRef = useRef(snapshot);
  const [optimized, setOptimized] = useState(true);
  const optimizedRef = useRef(true);
  const [busy, setBusy] = useState(false);
  const [captureFrames, setCaptureFrames] = useState(false);
  const frameMode = useRef(false);
  const [status, setStatus] = useState('Pronto. Este laboratório tem um pedido independente.');
  const [results, setResults] = useState<Result[]>([]);
  const cancel = useRef(false);
  const rows = useRef(0);
  const pending = useRef<{ start: number; model: number; resolve: (m: Measurement) => void } | null>(null);
  const onRowRender = useCallback(() => { rows.current++; }, []);
  const onChange = useCallback((action: ItemChange) => {
    const next = changeItems(stateRef.current, action, optimizedRef.current);
    stateRef.current = next; setSnapshot(next);
  }, []);
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const commit = performance.now() - p.start;
    const renderedRows = rows.current;
    if (frameMode.current) requestAnimationFrame(() => requestAnimationFrame(() => p.resolve({ commit, frame: performance.now() - p.start, rows: renderedRows, model: p.model })));
    else setTimeout(() => p.resolve({ commit, rows: renderedRows, model: p.model }), 0);
  }, [snapshot]);
  async function measure(action: ItemChange) {
    if (cancel.current || document.visibilityState !== 'visible') throw new Error('Teste interrompido. Mantenha esta aba visível para medir os frames.');
    return new Promise<Measurement>((resolve, reject) => {
      const start = performance.now(); rows.current = 0;
      const next = changeItems(stateRef.current, action, optimizedRef.current);
      const model = performance.now() - start;
      const timeout = window.setTimeout(() => { pending.current = null; reject(new Error('Tempo limite: aba oculta ou navegador ocupado.')); }, 5000);
      pending.current = { start, model, resolve: result => { clearTimeout(timeout); resolve(result); } };
      stateRef.current = next; setSnapshot(next);
    });
  }
  async function run() {
    cancel.current = false; frameMode.current = captureFrames; setBusy(true); setResults([]);
    const collected: Result[] = [];
    const original = stateRef.current;
    const originalMode = optimizedRef.current;
    try {
      for (const fast of [false, true]) {
        optimizedRef.current = fast; setOptimized(fast); await frames();
        for (const size of testSizes) {
          const mode = fast ? 'Otimizado' : 'Base';
          setStatus(`${mode}: ${size} itens…`);
          const fixture = performanceItems(size);
          await measure({ type: 'replace', items: fixture }); // warm up mounting, excluded
          const searches: number[] = [], totals: number[] = [];
          for (let i = 0; i < 200; i++) {
            let start = performance.now(); search(['gran zero', 'whey choc', 'acucar coco', 'far aveia'][i % 4]); searches.push(performance.now() - start);
            const previous = fixture[0], next = { ...previous, quantity: previous.quantity + 1 };
            start = performance.now();
            if (fast) updateItemTotals(stateRef.current.totals, previous, next);
            else initialItemsState([next, ...fixture.slice(1)]);
            totals.push(performance.now() - start);
          }
          for (const [operation, values] of [['Busca (CPU)', searches], ['Totais (CPU)', totals]] as const) collected.push({ size, mode, operation, samples: values.length, cpuP50: percentile(values, .5), cpuP95: percentile(values, .95) });
          for (const operation of ['Adicionar', 'Quantidade', 'Excluir', 'Carregar tabela']) {
            const samples: Measurement[] = [];
            for (let iteration = 0; iteration < 12; iteration++) {
              await measure({ type: 'replace', items: fixture });
              const action: ItemChange = operation === 'Adicionar' ? { type: 'add', item: { ...fixture[0], id: `added-${iteration}` } }
                : operation === 'Quantidade' ? { type: 'edit', item: { ...fixture[Math.floor(size / 2)], quantity: 25 } }
                : operation === 'Excluir' ? { type: 'delete', id: fixture[Math.floor(size / 2)].id }
                : { type: 'replace', items: performanceItems(size) };
              const measurement = await measure(action);
              if (iteration >= 2) samples.push(measurement); // two warm-ups per operation
            }
            collected.push({ size, mode, operation, samples: samples.length, cpuP50: percentile(samples.map(x => x.model), .5), cpuP95: percentile(samples.map(x => x.model), .95), commitP95: percentile(samples.map(x => x.commit), .95), frameP50: frameMode.current ? percentile(samples.map(x => x.frame!), .5) : undefined, frameP95: frameMode.current ? percentile(samples.map(x => x.frame!), .95) : undefined, rows: percentile(samples.map(x => x.rows), .5) });
          }
          setResults([...collected]);
        }
      }
      setStatus('Teste concluído. Compare Base × Otimizado e exporte os resultados.');
    } catch (error) { setStatus((error as Error).message); }
    finally {
      pending.current = null;
      optimizedRef.current = originalMode; setOptimized(originalMode);
      stateRef.current = original; setSnapshot(original); setBusy(false);
    }
  }
  function exportResults() {
    const payload = { recordedAt: new Date().toISOString(), userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio }, frameMeasurement: results.some(r => r.frameP95 !== undefined), method: '10 amostras após 2 aquecimentos. Commit: atualização até useLayoutEffect. Frame: dois requestAnimationFrame, proxy de oportunidade de pintura, não medição exata de pixels. CPU: performance.now; abaixo da resolução do relógio pode ser zero.', results };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'atram-performance-etapa3.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <main className="performance-lab"><header><h1>Diagnóstico de pedidos grandes</h1><a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}>← Voltar ao pedido</a></header>
    <p>Pedido de teste independente. A execução automática preserva os itens deste laboratório. Nada é salvo ou enviado ao ERP.</p>
    <div className="lab-controls"><label>Linhas <select aria-label="Quantidade de linhas de teste" disabled={busy} value={snapshot.items.length} onChange={e => onChange({ type: 'replace', items: performanceItems(Number(e.target.value)) })}>{!testSizes.some(n => n === snapshot.items.length) && <option value={snapshot.items.length}>{snapshot.items.length}</option>}{testSizes.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <label><input type="checkbox" checked={optimized} disabled={busy} onChange={e => { optimizedRef.current = e.target.checked; setOptimized(e.target.checked); }} /> Linhas memoizadas e totais incrementais</label>
    <label><input type="checkbox" checked={captureFrames} disabled={busy} onChange={e => setCaptureFrames(e.target.checked)} /> Medir quadros de tela (mais demorado)</label>
    <button className="button primary" disabled={busy} onClick={run}>Executar comparação completa</button>
    {busy && <button className="button secondary" onClick={() => { cancel.current = true; }}>Interromper teste</button>}
    <button className="button secondary" disabled={busy || !results.length} onClick={exportResults}>Exportar resultados JSON</button></div>
    <p role="status">{status}</p>
    <p className="lab-explanation">Mantenha a aba visível. Por padrão medimos CPU e commit; quadros são opcionais e podem ser lentos em navegadores remotos. Base: todas as linhas renderizam e os totais são recalculados. Otimizado: mesmas operações, com memoização e atualização incremental. “Frame” usa dois quadros como aproximação de apresentação; não mede pixels nem latência de teclado. CPU inclui modelo; commit inclui a atualização React/DOM. Renderizações contam chamadas da função de linha.</p>
    {results.length > 0 && <div className="lab-results"><table aria-label="Resultados de performance"><thead><tr>{['Modo', 'Itens', 'Operação', 'Amostras', 'CPU p50 ms', 'CPU p95 ms', 'Commit p95 ms', 'Frame p50 ms', 'Frame p95 ms', 'Linhas renderizadas'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{results.map(r => <tr key={`${r.mode}-${r.size}-${r.operation}`}><td>{r.mode}</td><td>{r.size}</td><td>{r.operation}</td><td>{r.samples}</td><td>{number(r.cpuP50)}</td><td>{number(r.cpuP95)}</td><td>{number(r.commitP95)}</td><td>{number(r.frameP50)}</td><td>{number(r.frameP95)}</td><td>{r.rows ?? '—'}</td></tr>)}</tbody></table></div>}
    <div className="lab-workspace" inert={busy}><OrderItems items={snapshot.items} onChange={onChange} optimized={optimized} onRowRender={onRowRender} /><OrderSummary totals={snapshot.totals} /></div>
  </main>;
}
