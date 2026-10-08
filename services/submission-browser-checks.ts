import { demoOrder } from '../domain/mock-data.ts';
import { submissionPayload } from '../domain/submission.ts';
import { MockERPProvider, IndexedDBERPLedger, type MockScenario } from '../integrations/MockERPProvider.ts';
import { DraftRepository } from '../repositories/draft-repository.ts';
import { SubmissionCoordinator } from './submission-coordinator.ts';
import type { Order } from '../types/order';
export async function runSubmissionBrowserChecks() {
  const results: object[] = []; let checks = 0;
  const check = (condition: boolean, message: string) => { checks++; if (!condition) throw new Error(message); };
  const scenarios: MockScenario[] = ['success','400','401','429','500','timeout-before','timeout-after'];
  for (const scenario of scenarios) {
    const name = 'atram-stage5-test-' + crypto.randomUUID();
    const ledger = new IndexedDBERPLedger(name + '-erp'); const repository = new DraftRepository(name + '-draft');
    let order: Order = { ...structuredClone(demoOrder), orderId: crypto.randomUUID() }; let revision = 0;
    let selected = scenario; const metrics: object[] = [];
    const provider = new MockERPProvider(ledger, () => ({ scenario: selected, delayMs: 0, retryAfterMs: 10 }));
    const persist = async (value: Order) => { order = value; const receipt = await repository.save(value, revision); revision = receipt.revision; metrics.push(receipt); };
    const make = () => new SubmissionCoordinator(() => order, persist, provider);
    try {
      const payload = submissionPayload(order); await make().submit(payload);
      const initial = order.status; const id = order.submissionId!;
      check(initial === (scenario === 'success' ? 'SUBMITTED' : ['400','401','429'].includes(scenario) ? 'ERROR' : 'UNKNOWN'), 'Estado inicial incorreto: ' + scenario);
      // Reload equivalent: fresh repository connection and fresh coordinator, reading only committed data.
      await repository.close(); const [saved] = await repository.list(); order = saved.order; revision = saved.revision;
      check(order.submissionId === id && order.submission?.payload === payload, 'Recuperação alterou a tentativa.');
      if (order.status !== 'SUBMITTED') await make().reconcile();
      const found = await ledger.find(id);
      check((order.status === 'SUBMITTED') === ['success','timeout-after'].includes(scenario), 'Reconciliação incorreta.');
      check(!!found === ['success','timeout-after'].includes(scenario), 'Recibo inesperado.');
      selected = 'success'; if (scenario === '429') await new Promise(r => setTimeout(r, 15));
      let finalPayload=payload;
      if(scenario==='400'){await make().correct();order={...order,payment:{...order.payment,terms:'15 30'}};finalPayload=submissionPayload(order);}
      await make().submit(finalPayload); await make().submit(finalPayload);
      const activeId=order.submissionId!; const receipt = (await ledger.find(activeId))!;
      check(order.status === 'SUBMITTED' && (scenario==='400'?order.submissionHistory?.[0].submissionId===id:order.submissionId===id) && receipt.payload === finalPayload, 'Reenvio mudou a identidade.');
      // Independent connections race on the same durable unique indexes.
      const secondLedger = new IndexedDBERPLedger(name + '-erp');
      const secondProvider = new MockERPProvider(secondLedger, () => ({scenario:'success',delayMs:0}));
      const duplicates = await Promise.all(Array.from({length:20}, (_,i) => (i % 2 ? provider : secondProvider).createOrder(order,activeId)));
      check(duplicates.every(r => r.erpOrderId === receipt.erpOrderId), 'Pedido duplicado.');
      const rotated = await Promise.allSettled([secondProvider.createOrder(order,crypto.randomUUID()), provider.createOrder({...order,notes:'conteúdo adulterado'},activeId)]);
      check(rotated.every(r => r.status === 'rejected'), 'Conflito foi aceito.');
      await secondLedger.close();
      // A stale tab cannot write over a final receipt or modify the frozen order.
      const stale = await Promise.allSettled([repository.save({...order,status:'DRAFT',submissionId:null,submission:undefined},revision-1),repository.save({...order,notes:'alterado'},revision)]);
      check(stale.every(r => r.status === 'rejected'), 'Gravação conflitante foi aceita.');
      check((await repository.list())[0].order.submission?.erpOrderId === receipt.erpOrderId, 'Recibo local foi perdido.');
      results.push({scenario,initial,afterReloadAndReconciliation:['success','timeout-after'].includes(scenario)?'SUBMITTED':'ERROR',final:order.status,submissionId:activeId,previousSubmissionId:scenario==='400'?id:undefined,erpOrderId:receipt.erpOrderId,concurrentReplayCount:20,uniqueReceipts:1,metrics});
    } finally {
      await ledger.close(); await repository.close();
      // Only isolated databases created by this diagnostic are removed.
      indexedDB.deleteDatabase(name + '-erp'); indexedDB.deleteDatabase(name + '-draft');
    }
  }
  {
    const name='atram-stage5-test-'+crypto.randomUUID();
    const ledgerA=new IndexedDBERPLedger(name);const ledgerB=new IndexedDBERPLedger(name);
    const a=new MockERPProvider(ledgerA,()=>({scenario:'success',delayMs:0}));const b=new MockERPProvider(ledgerB,()=>({scenario:'success',delayMs:0}));
    try {
      const order={...structuredClone(demoOrder),orderId:crypto.randomUUID()};const id=crypto.randomUUID();
      const receipts=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).createOrder(order,id)));
      check(new Set(receipts.map(r=>r.erpOrderId)).size===1,'Criações concorrentes geraram recibos distintos.');
      check((await ledgerA.find(id))?.erpOrderId===receipts[0].erpOrderId,'Recibo concorrente não ficou durável.');
      const another={...order,orderId:crypto.randomUUID()};
      const keys=Array.from({length:20},()=>crypto.randomUUID());
      const competing=await Promise.allSettled(keys.map((key,i)=>(i%2?a:b).createOrder(another,key)));
      check(competing.filter(r=>r.status==='fulfilled').length===1,'Identidades diferentes duplicaram o mesmo pedido.');
      const stored=await Promise.all(keys.map(key=>ledgerB.find(key)));
      check(stored.filter(Boolean).length===1,'Índice único por pedido não protegeu a transação.');
      results.push({scenario:'cold-concurrent-creation',sameIdentityCalls:20,uniqueReceipts:1,differentIdentityCalls:20,acceptedIdentities:1});
    } finally {await ledgerA.close();await ledgerB.close();indexedDB.deleteDatabase(name);}
  }
  for (const failAt of [1, 2]) {
    const name = 'atram-stage5-test-' + crypto.randomUUID();
    const ledger = new IndexedDBERPLedger(name + '-erp'); const repo = new DraftRepository(name + '-draft');
    let order: Order = {...structuredClone(demoOrder),orderId:crypto.randomUUID()};
    let revision = (await repo.save(order,0)).revision; let writes = 0; let fail = true;
    const provider = new MockERPProvider(ledger,()=>({scenario:'success',delayMs:0}));
    const persist = async (value: Order) => {order=value; writes++; if (fail && writes===failAt) throw new Error('Falha local injetada'); revision=(await repo.save(value,revision)).revision;};
    try {
      const coordinator = new SubmissionCoordinator(()=>order,persist,provider);
      const outcome = await Promise.allSettled([coordinator.submit(submissionPayload(order))]);
      check(outcome[0].status==='rejected','Falha de gravação não foi propagada.');
      const id=order.submissionId!; const serverBefore=await ledger.find(id);
      check(!!serverBefore === (failAt===2),'A barreira de durabilidade não protegeu o envio.');
      await repo.close(); order=(await repo.list())[0].order;
      check(order.status===(failAt===1?'DRAFT':'SUBMITTING'),'Estado recuperado incorreto após falha.');
      fail=false; const recovered=new SubmissionCoordinator(()=>order,persist,provider);
      if(failAt===2) await recovered.reconcile(); else await recovered.submit(submissionPayload(order));
      check(order.status==='SUBMITTED','Recuperação após falha de gravação não concluiu.');
      if(failAt===2) check(order.submissionId===id && order.submission?.erpOrderId===serverBefore!.erpOrderId,'Recuperação criou outra identidade.');
      results.push({scenario:failAt===1?'local-save-before-send-fails':'local-save-after-server-commit-fails',recovered:order.status,createdBeforeRecovery:!!serverBefore,erpOrderId:order.submission?.erpOrderId});
    } finally {await ledger.close();await repo.close();indexedDB.deleteDatabase(name+'-erp');indexedDB.deleteDatabase(name+'-draft');}
  }
  return {result:'PASS',executedAt:new Date().toISOString(),userAgent:navigator.userAgent,checks,storage:'Real IndexedDB; separate durable ERP ledger; independent connections',results};
}
