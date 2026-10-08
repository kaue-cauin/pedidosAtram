'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { demoItems, demoOrder } from '@/domain/mock-data';
import { initialItemsState, itemsReducer, type ItemChange } from '@/domain/order-state';
import type { Order } from '@/types/order';
import { DraftRepository, type DraftRecord } from '@/repositories/draft-repository';
import { AutosaveQueue } from '@/services/autosave-queue';

export type OrderFields = Omit<Order, 'items'>;
export type FieldsChange = Partial<Omit<OrderFields, 'orderId' | 'status' | 'submissionId' | 'submission'>>;
const fieldsOf = ({ items: _items, ...fields }: Order): OrderFields => fields;
function newFields(): OrderFields {
  const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return { ...fieldsOf(demoOrder), orderId: crypto.randomUUID(), saleDate: date.toISOString().slice(0, 10) };
}
export function downloadOrder(order: Order) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), order }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `atram-rascunho-${order.orderId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function useDraftOrder() {
  const [itemsState, rawDispatch] = useReducer(itemsReducer, demoItems, initialItemsState);
  const [fields, setFields] = useState<OrderFields>(() => fieldsOf(demoOrder));
  const [phase, setPhase] = useState<'loading' | 'recovery' | 'ready' | 'unavailable'>('loading');
  const [candidates, setCandidates] = useState<DraftRecord[]>([]);
  const [loadError, setLoadError] = useState('');
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const storageDisabled = useRef(false);
  const skipRecovered = useRef(false);
  const [queue, setQueue] = useState<AutosaveQueue<Order>>();
  const repositoryRef = useRef<DraftRepository | null>(null);
  const queueRef = useRef<AutosaveQueue<Order> | null>(null);
  const revisionRef = useRef(0);
  const baselineRef = useRef<Order | null>(null);
  const order = useMemo<Order>(() => ({ ...fields, items: itemsState.items }), [fields, itemsState.items]);
  const orderRef = useRef(order); orderRef.current = order;
  const dispatch = useCallback((change: ItemChange) => { if (!orderRef.current.submissionId) rawDispatch(change); }, []);
  const patchFields = useCallback((patch: FieldsChange) => { if (!orderRef.current.submissionId) setFields(previous => previous.submissionId ? previous : ({ ...previous, ...patch })); }, []);
  const persistSubmission = useCallback(async (snapshot: Order) => {
    const activeQueue = queueRef.current;
    if (storageDisabled.current || !activeQueue || phaseRef.current !== 'ready') throw new Error('Envio exige armazenamento local disponível.');
    // Lock immediately, before React commits or any asynchronous persistence begins.
    orderRef.current = snapshot; baselineRef.current = snapshot;
    setFields(fieldsOf(snapshot)); activeQueue.schedule(snapshot);
    await activeQueue.flush();
  }, []);
  const getOrder = useCallback(() => orderRef.current, []);
  useEffect(() => {
    let cancelled = false;
    const repository = new DraftRepository(); repositoryRef.current = repository;
    const autosave = new AutosaveQueue<Order>(async value => {
      const receipt = await repository.save(value, revisionRef.current);
      revisionRef.current = receipt.revision; return receipt;
    });
    queueRef.current = autosave; setQueue(autosave);
    void repository.list().then(records => {
      if (cancelled) return;
      setCandidates(records);
      if (records.length) setPhase('recovery');
      else { setFields(newFields()); setPhase('ready'); }
    }).catch(error => { if (!cancelled) { setLoadError((error as Error).message); setPhase('unavailable'); } });
    function enqueueLatest() {
      if (phaseRef.current !== 'ready' || storageDisabled.current) return;
      if (baselineRef.current !== orderRef.current) { baselineRef.current = orderRef.current; autosave.schedule(orderRef.current); }
    }
    function flushHidden() { if (document.visibilityState === 'hidden') { enqueueLatest(); void autosave.flush().catch(() => {}); } }
    function pagehide() { enqueueLatest(); void autosave.flush().catch(() => {}); }
    function beforeUnload(event: BeforeUnloadEvent) {
      // Cover an update whose passive effect has not yet enqueued its snapshot.
      if (phaseRef.current !== 'ready') return;
      enqueueLatest();
      if (storageDisabled.current || autosave.getSnapshot().dirty) { event.preventDefault(); event.returnValue = ''; void autosave.flush().catch(() => {}); }
    }
    document.addEventListener('visibilitychange', flushHidden);
    window.addEventListener('pagehide', pagehide); window.addEventListener('beforeunload', beforeUnload);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', flushHidden);
      window.removeEventListener('pagehide', pagehide); window.removeEventListener('beforeunload', beforeUnload);
      void autosave.flush().catch(() => {}).finally(() => { autosave.dispose(); void repository.close(); });
    };
  }, []);
  useEffect(() => {
    if (phase !== 'ready' || !queue || storageDisabled.current) return;
    if (order.status !== orderRef.current.status || order.submissionId !== orderRef.current.submissionId) return;
    if (skipRecovered.current) { skipRecovered.current = false; baselineRef.current = order; return; }
    if (baselineRef.current === order) return;
    baselineRef.current = order;
    queue.schedule(order);
  }, [order, phase, queue]);
  function recover(record: DraftRecord) {
    revisionRef.current = record.revision; skipRecovered.current = true;
    const restored = { ...record.order, items: record.order.items };
    const restoredFields = fieldsOf(restored);
    baselineRef.current = { ...restoredFields, items: restored.items };
    orderRef.current = restored; setFields(restoredFields); rawDispatch({ type: 'replace', items: restored.items }); setPhase('ready');
  }
  function startNew() { revisionRef.current = 0; baselineRef.current = null; setFields(newFields()); rawDispatch({ type: 'replace', items: demoItems }); setPhase('ready'); }
  async function saveNow() {
    if (phase !== 'ready' || !queue) throw new Error('Autosave indisponível. Exporte o pedido para preservá-lo.');
    if (baselineRef.current !== orderRef.current) { baselineRef.current = orderRef.current; queue.schedule(orderRef.current); }
    return queue.flush();
  }
  function continueWithoutStorage() { storageDisabled.current = true; setQueue(undefined); queueRef.current?.dispose(); setFields(newFields()); setPhase('ready'); }
  return { order, getOrder, persistSubmission, fields, itemsState, dispatch, patchFields, phase, candidates, loadError, queue, recover, startNew, saveNow, continueWithoutStorage, exportOrder: () => downloadOrder(orderRef.current) };
}
