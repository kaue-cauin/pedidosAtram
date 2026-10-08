export interface SaveReceipt { revision: number; savedAt: string; indexedDbMs: number; persistenceMs: number }
export interface SaveMetrics extends SaveReceipt { autosaveMs: number; queueMs: number; sequence: number; completedAtMs: number }
export interface AutosaveState { phase: 'idle' | 'queued' | 'saving' | 'saved' | 'error'; dirty: boolean; error?: string; metrics?: SaveMetrics }
type Pending<T> = { value: T; at: number; sequence: number };

// One writer, latest snapshot only. schedule() never serializes or touches IndexedDB.
export class AutosaveQueue<T> {
  private pending?: Pending<T>;
  private active?: Promise<SaveMetrics>;
  private timer?: ReturnType<typeof setTimeout>;
  private firstQueuedAt?: number;
  private sequence = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  private state: AutosaveState = { phase: 'idle', dirty: false };
  private write: (value: T) => Promise<SaveReceipt>;
  private options: { debounceMs?: number; maxWaitMs?: number; onMetric?: (metric: SaveMetrics) => void };
  constructor(write: (value: T) => Promise<SaveReceipt>, options: { debounceMs?: number; maxWaitMs?: number; onMetric?: (metric: SaveMetrics) => void } = {}) { this.write = write; this.options = options; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(state: AutosaveState) { this.state = state; for (const listener of this.listeners) listener(); }
  schedule(value: T) {
    if (this.disposed) return;
    const at = performance.now();
    this.pending = { value, at, sequence: ++this.sequence };
    this.firstQueuedAt ??= at;
    this.emit({ ...this.state, phase: this.active ? 'saving' : 'queued', dirty: true, error: undefined });
    this.arm();
  }
  private arm() {
    clearTimeout(this.timer);
    if (!this.pending || this.active || this.disposed) return;
    const remaining = (this.options.maxWaitMs ?? 1000) - (performance.now() - this.firstQueuedAt!);
    this.timer = setTimeout(() => { void this.drain().catch(() => {}); }, Math.max(0, Math.min(this.options.debounceMs ?? 250, remaining)));
  }
  private drain(): Promise<SaveMetrics> {
    if (this.active) return this.active;
    if (!this.pending) return Promise.reject(new Error('Nenhuma alteração pendente.'));
    clearTimeout(this.timer);
    const entry = this.pending;
    this.pending = undefined; this.firstQueuedAt = undefined;
    this.emit({ ...this.state, phase: 'saving', dirty: true, error: undefined });
    const start = performance.now();
    // Promise boundary also contains synchronous adapter failures.
    const operation = Promise.resolve().then(() => this.write(entry.value)).then(receipt => {
      const metric = { ...receipt, sequence: entry.sequence, completedAtMs: performance.now(), queueMs: start - entry.at, autosaveMs: performance.now() - entry.at };
      this.emit({ phase: this.pending ? 'queued' : 'saved', dirty: !!this.pending, metrics: metric });
      this.options.onMetric?.(metric);
      return metric;
    }).catch(error => {
      // Never discard an unsaved snapshot. A newer edit supersedes the failed one.
      if (!this.pending) { this.pending = entry; this.firstQueuedAt = entry.at; }
      this.emit({ ...this.state, phase: 'error', dirty: true, error: error instanceof Error ? error.message : 'Falha ao salvar localmente.' });
      throw error;
    }).finally(() => {
      this.active = undefined;
      if (this.state.phase !== 'error') this.arm();
    });
    this.active = operation;
    return operation;
  }
  async flush(): Promise<SaveMetrics | undefined> {
    clearTimeout(this.timer);
    // Wait for the active writer, then save the latest snapshot (including edits made meanwhile).
    let metric = this.state.metrics;
    while (this.active || this.pending) metric = await (this.active ?? this.drain());
    return metric;
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); }
}
