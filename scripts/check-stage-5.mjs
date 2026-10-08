import assert from 'node:assert/strict';
import { demoOrder } from '../domain/mock-data.ts';
import { submissionPayload } from '../domain/submission.ts';
import { validateDraft } from '../repositories/draft-repository.ts';
import { MockERPProvider } from '../integrations/MockERPProvider.ts';
import { MemoryERPLedger } from '../integrations/erp-ledger.ts';
import { ERPFailure } from '../integrations/ERPProvider.ts';
import { SubmissionCoordinator } from '../services/submission-coordinator.ts';
let checks = 0;
const eq = (a,b) => { assert.deepEqual(a,b); checks++; };
function fixture(scenario = 'success') {
  const ledger = new MemoryERPLedger(); let order = {...structuredClone(demoOrder), orderId: crypto.randomUUID()}; let durable;
  const opts = {scenario, delayMs: 0, retryAfterMs: 15, online: true}; let failAt = 0; let writes = 0;
  const persist = async value => {
    order = structuredClone(value); writes++;
    if (writes === failAt) throw new Error('quota');
    validateDraft({schemaVersion: 3, orderId: order.orderId, revision: writes, savedAt: new Date().toISOString(), order});
    durable = structuredClone(value);
  };
  const provider = new MockERPProvider(ledger, () => opts);
  const make = () => new SubmissionCoordinator(() => order, persist, provider);
  return {ledger, opts, provider, make, get order(){return order;}, get durable(){return durable;}, fail(n){failAt=n;}, restore(){order=structuredClone(durable);}, mutate(){order.notes='changed';}};
}
const results = [];
for (const scenario of ['success','400','401','429','500','timeout-before','timeout-after']) {
  const f = fixture(scenario), c = f.make(); const payload = submissionPayload(f.order);
  await c.submit(payload); const initial = f.order.status;
  eq(initial, scenario==='success' ? 'SUBMITTED' : ['400','401','429'].includes(scenario) ? 'ERROR' : 'UNKNOWN');
  eq(f.ledger.creations, ['success','timeout-after'].includes(scenario) ? 1 : 0);
  const id = f.order.submissionId;
  // Unknown may not be directly resent, even after a fresh controller (refresh).
  f.restore(); const recovered = f.make();
  if (f.order.status==='UNKNOWN') { await assert.rejects(recovered.submit(payload), /Consulte/); checks++; }
  if (scenario==='429') { await assert.rejects(recovered.submit(payload), /Aguarde/); checks++; }
  if (f.order.status!=='SUBMITTED') await recovered.reconcile();
  eq(f.ledger.creations, ['success','timeout-after'].includes(scenario) ? 1 : 0);
  eq(f.order.status, ['success','timeout-after'].includes(scenario) ? 'SUBMITTED' : 'ERROR');
  if (scenario==='429') await new Promise(r => setTimeout(r, 20));
  f.opts.scenario='success'; let finalPayload=payload;
  if(scenario==='400'){await recovered.correct();f.order.payment={...f.order.payment,terms:'15 30'};finalPayload=submissionPayload(f.order);}
  await recovered.submit(finalPayload); await recovered.submit(finalPayload);
  eq(f.order.status, 'SUBMITTED'); eq(scenario==='400'?f.order.submissionHistory[0].submissionId:f.order.submissionId,id); eq(f.ledger.creations,1); eq(f.order.submission.payload,finalPayload);
  results.push({scenario,initial,final:f.order.status,erpOrders:f.ledger.creations,sameSubmissionId:scenario!=='400',correctionArchived:scenario==='400'});
}
// Barrier fails: no outbound request or ERP creation. Reload with no record is safe.
{
 const f=fixture(); f.fail(1); await assert.rejects(f.make().submit(submissionPayload(f.order)),/quota/); checks++;
 eq(f.ledger.creations,0); eq(f.durable,undefined);
}
// Server accepted, final local commit fails: durable SUBMITTING survives and reconciles.
{
 const f=fixture(); f.fail(2); await assert.rejects(f.make().submit(submissionPayload(f.order)),/quota/); checks++;
 eq(f.durable.status,'SUBMITTING'); eq(f.ledger.creations,1); const id=f.durable.submissionId;
 f.restore(); f.fail(0); await f.make().reconcile(); eq(f.order.status,'SUBMITTED'); eq(f.order.submissionId,id); eq(f.ledger.creations,1);
}
// Same operation double click; independent clients + malicious key rotation cannot duplicate.
{
 const f=fixture(); f.opts.delayMs=5; const c=f.make(); const payload=submissionPayload(f.order);
 const outcomes=await Promise.allSettled([c.submit(payload),c.submit(payload)]); eq(outcomes.map(o=>o.status),['fulfilled','rejected']); eq(f.ledger.creations,1);
 const original=await f.provider.findSubmission(f.order.submissionId);
 await Promise.all(Array.from({length:100},()=>f.provider.createOrder(f.order,f.order.submissionId)));
 eq(f.ledger.creations,1);
 await assert.rejects(f.provider.createOrder({...f.order,notes:'different'},f.order.submissionId),/Conflito/); checks++;
 await assert.rejects(f.provider.createOrder(f.order,crypto.randomUUID()),/Conflito/); checks++;
 eq(await f.provider.findSubmission(f.order.submissionId),original); eq(f.ledger.creations,1);
}
// Offline and lookup failure preserve uncertainty and identity. No automatic retry.
{
 const f=fixture('timeout-after'); await f.make().submit(submissionPayload(f.order)); const id=f.order.submissionId;
 f.opts.online=false; await f.make().reconcile(); eq(f.order.status,'UNKNOWN'); eq(f.ledger.creations,1);
 f.opts.online=true; await f.make().reconcile(); eq(f.order.status,'SUBMITTED'); eq(f.order.submissionId,id);
}
// A generic HTTP 500 can occur AFTER the server commit too. It is always ambiguous.
{
 const f=fixture(); const original=f.provider.createOrder.bind(f.provider);
 f.provider.createOrder=async (order,id)=>{await original(order,id);throw new ERPFailure('HTTP 500 após commit','unknown');};
 await f.make().submit(submissionPayload(f.order));eq(f.order.status,'UNKNOWN');eq(f.ledger.creations,1);
 f.restore();await f.make().reconcile();eq(f.order.status,'SUBMITTED');eq(f.ledger.creations,1);
}
// A missing lookup while the original request is still pending never rotates identity.
{
 const f=fixture('timeout-before');await f.make().submit(submissionPayload(f.order));const id=f.order.submissionId;
 await f.make().reconcile();eq(f.order.status,'ERROR');f.opts.scenario='success';
 const payload=submissionPayload(f.order);
 await Promise.all([f.provider.createOrder(f.order,id),f.make().submit(payload)]);
 eq(f.order.submissionId,id);eq(f.order.status,'SUBMITTED');eq(f.ledger.creations,1);
}
// Tampered frozen envelope and changed review rejected; existing data never overwritten.
{
 const f=fixture('400'); const c=f.make(); const before=submissionPayload(f.order); f.mutate();
 await assert.rejects(c.submit(before),/mudou/); checks++; eq(f.ledger.creations,0);
 await c.submit(submissionPayload(f.order)); f.mutate(); f.order.notes='tampered again';
 await assert.rejects(c.reconcile(),/difere/); checks++; eq(f.ledger.creations,0);
 assert.throws(()=>validateDraft({schemaVersion:2,orderId:f.order.orderId,revision:1,savedAt:new Date().toISOString(),order:f.order}),/difere/); checks++;
}
console.log(JSON.stringify({result:'PASS',checks,results,additional:['durability barrier','crash after receipt before local commit','double click','100 idempotent concurrent calls','payload conflict','rotated identity conflict','offline reconciliation','immutable review','corrupt frozen draft']},null,2));
