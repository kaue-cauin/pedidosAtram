import { demoOrder } from '../domain/mock-data.ts';
import { assertOrderTransition, isEditable, submissionPayload } from '../domain/submission.ts';
import { validateDraft } from '../repositories/draft-repository.ts';
import { MockERPProvider, type MockScenario } from '../integrations/MockERPProvider.ts';
import type { ERPLedger } from '../integrations/erp-ledger.ts';
import { SubmissionCoordinator } from './submission-coordinator.ts';
import type { Order } from '../types/order';
export interface Stage6Store { ledger:ERPLedger; save:(order:Order,revision:number)=>Promise<number>; read:()=>Promise<{order:Order;revision:number}|undefined>; close:()=>Promise<void> }
export async function runStage6Checks(factory:()=>Promise<Stage6Store>) {
 let checks=0;const results:object[]=[];
 const check=(value:boolean,message:string)=>{checks++;if(!value)throw new Error(message);};
 async function rejects(work:()=>unknown|Promise<unknown>,message:string){let rejected=false;try{await work();}catch{rejected=true;}check(rejected,message);}
 for(const scenario of ['400','401','429','500','timeout-before','timeout-after','success'] as MockScenario[]) {
  const store=await factory();let order:Order={...structuredClone(demoOrder),orderId:crypto.randomUUID()};let revision=0;let selected=scenario;let online=true;
  const provider=new MockERPProvider(store.ledger,()=>({scenario:selected,delayMs:0,retryAfterMs:150,online}));
  const persist=async(next:Order)=>{const nextRevision=await store.save(next,revision);revision=nextRevision;order=next;};
  const coordinator=()=>new SubmissionCoordinator(()=>order,persist,provider);
  try {
   const payload=submissionPayload(order);await coordinator().submit(payload);const id=order.submissionId!;
   check(!!id && order.submission?.payload===payload,'Cópia não congelada.');
   check(order.status===(scenario==='success'?'SUBMITTED':['400','401','429'].includes(scenario)?'ERROR':'UNKNOWN'),'Estado inicial incorreto.');
   const before=await store.read();check(before?.order.submissionId===id,'Tentativa não ficou durável.');order=before!.order;revision=before!.revision;
   if(scenario==='400') {
    check(order.submission?.failureKind==='validation','400 não classificado.');check(!isEditable(order),'400 desbloqueou sem ação explícita.');
    await coordinator().correct();check(isEditable(order),'Correção não desbloqueou.');check(order.submissionId===null,'Identidade antiga não foi retirada.');
    check(order.submissionHistory?.length===1 && order.submissionHistory[0].submissionId===id,'Tentativa antiga não preservada.');
    const archive=JSON.stringify(order.submissionHistory);const log=JSON.stringify(order.submissionEvents);
    const read=await store.read();check(read?.order.status==='DRAFT' && JSON.stringify(read.order.submissionHistory)===archive,'Arquivo de rejeição não recuperou.');
    await rejects(()=>coordinator().submit(payload),'Revisão sem correção foi aceita.');
    await rejects(()=>provider.createOrder(order,id),'Tentativa antiga rejeitada pôde ser criada tardiamente.');
    await rejects(()=>persist({...order,submissionHistory:[]}),'Histórico foi removido.');
    await rejects(()=>persist({...order,submissionHistory:order.submissionHistory!.map(a=>({...a,message:'adulterado'}))}),'Histórico foi alterado.');
    await rejects(()=>persist({...order,submissionEvents:[]}),'Log anterior foi removido.');
    check(JSON.stringify((await store.read())!.order.submissionEvents)===log,'Gravação inválida sobrescreveu log bom.');
    await persist({...order,payment:{...order.payment,terms:'15 30'}});selected='success';await coordinator().submit(submissionPayload(order));
    check(order.submissionId!==id,'Correção reutilizou identidade antiga.');check(JSON.stringify(order.submissionHistory)===archive,'Nova tentativa alterou arquivo.');
    check(order.status==='SUBMITTED','Pedido corrigido não foi enviado.');check(await store.ledger.find(id)===null,'400 criou pedido antigo.');
   } else if(scenario==='401'||scenario==='429') {
    check(order.submission?.failureKind===(scenario==='401'?'auth':'rate-limit'),'Classificação incorreta.');
    await rejects(()=>coordinator().correct(),'Auth/rate limit permitiu corrigir conteúdo.');
    await rejects(()=>persist({...order,payment:{...order.payment,terms:'diferente'}}),'Conteúdo congelado foi alterado.');
    if(scenario==='429') {
     check((order.submission?.retryAt??0)>Date.now(),'Retry-After ausente.');
     await rejects(()=>coordinator().submit(payload),'429 ignorou prazo.');await coordinator().reconcile();
     check(order.submission?.failureKind==='rate-limit','Consulta apagou rate limit.');
     await rejects(()=>coordinator().submit(payload),'Consulta permitiu antecipar nova tentativa.');await new Promise(r=>setTimeout(r,160));
    }
    selected='success';await coordinator().submit(payload);check(order.submissionId===id && order.submission?.payload===payload,'Retry trocou identidade/conteúdo.');
   } else if(scenario!=='success') {
    check(!isEditable(order),'UNKNOWN permite edição.');await rejects(()=>coordinator().correct(),'UNKNOWN permite corrigir.');
    await rejects(()=>coordinator().submit(payload),'UNKNOWN permite reenvio direto.');
    await rejects(()=>persist({...order,submissionId:crypto.randomUUID()}),'UNKNOWN permite identidade nova.');
    await rejects(()=>persist({...order,status:'DRAFT',submissionId:null,submission:undefined}),'UNKNOWN permite rascunho.');
    const receiptBefore=await store.ledger.find(id);online=false;await coordinator().reconcile();check(order.status==='UNKNOWN','Consulta offline apagou incerteza.');
    check(JSON.stringify(await store.ledger.find(id))===JSON.stringify(receiptBefore),'Consulta criou pedido.');
    online=true;await coordinator().reconcile();check(order.status===(scenario==='timeout-after'?'SUBMITTED':'ERROR'),'Consulta não determinou resultado.');
    check(order.submissionId===id,'Consulta mudou identidade.');
    selected='success';await coordinator().submit(payload);check(order.submissionId===id,'Timeout gerou outra identidade.');
   }
   check(order.status==='SUBMITTED','Estado final incorreto.');const final=await store.read();
   check(final?.order.submission?.erpOrderId===order.submission?.erpOrderId,'Recibo não persistido.');
   await rejects(()=>persist({...order,status:'ERROR'}),'SUBMITTED regrediu.');
   await rejects(()=>persist({...order,notes:'mudança após envio'}),'SUBMITTED alterou conteúdo.');
   await rejects(()=>store.save({...order,notes:'aba antiga'},revision-1),'Aba desatualizada sobrescreveu.');
   check(JSON.stringify(await store.read())===JSON.stringify(final),'Falha sobrescreveu registro bom.');
   results.push({scenario,status:order.status,historyCount:order.submissionHistory?.length??0,sameIdentity:scenario!=='400'});
  } finally {await store.close();}
 }
 // Recovery of a truly in-flight attempt (durable SUBMITTING), with no automatic resend.
 {
  const store=await factory();let order:Order={...structuredClone(demoOrder),orderId:crypto.randomUUID()};let revision=0;
  const provider=new MockERPProvider(store.ledger,()=>({scenario:'success',delayMs:0}));
  const persist=async(next:Order)=>{revision=await store.save(next,revision);order=next;};
  try{
   order={...order,status:'SUBMITTING',submissionId:crypto.randomUUID(),submission:{payload:submissionPayload(order),startedAt:new Date().toISOString()}};await persist(order);
   const recovered=(await store.read())!;order=recovered.order;revision=recovered.revision;
   const c=new SubmissionCoordinator(()=>order,persist,provider);
   await rejects(()=>c.submit(submissionPayload(order)),'SUBMITTING recuperado foi reenviado.');await rejects(()=>c.correct(),'SUBMITTING permitiu corrigir.');
   check(await provider.findSubmission(order.submissionId!)===null,'Recuperação criou pedido automaticamente.');await c.reconcile();check(order.status==='ERROR','SUBMITTING não reconciliou.');
   const id=order.submissionId;await c.submit(submissionPayload(order));check(order.status==='SUBMITTED' && order.submissionId===id,'Recuperação perdeu identidade.');
  }finally{await store.close();}
 }
 // Failed archive save must never release the editable draft or lose the old attempt.
 {
  const store=await factory();let order:Order={...structuredClone(demoOrder),orderId:crypto.randomUUID()};let revision=0;let failCorrection=false;
  const provider=new MockERPProvider(store.ledger,()=>({scenario:'400',delayMs:0}));
  const persist=async(value:Order)=>{if(failCorrection&&value.status==='DRAFT')throw new Error('quota');revision=await store.save(value,revision);order=value;};
  try {
   const c=new SubmissionCoordinator(()=>order,persist,provider);await c.submit(submissionPayload(order));const frozen=JSON.stringify(await store.read());failCorrection=true;
   await rejects(()=>c.correct(),'Falha na gravação do arquivo foi ignorada.');
   check(!isEditable(order),'Falha no arquivo liberou edição.');check(JSON.stringify(await store.read())===frozen,'Falha destruiu rejeição anterior.');
  }finally{await store.close();}
 }
 // Schemas remain readable; unknown schema and corrupted data are rejected in memory.
 const record={orderId:demoOrder.orderId,revision:1,savedAt:new Date().toISOString(),order:structuredClone(demoOrder)};
 for(const version of [1,2,3] as const)check(validateDraft({...record,schemaVersion:version}).order.orderId===demoOrder.orderId,'Schema antigo não recuperou.');
 for(const broken of [{...record,schemaVersion:99},{...record,schemaVersion:3,order:{...demoOrder,items:[{...demoOrder.items[0],quantity:NaN}]}},{...record,schemaVersion:3,order:{...demoOrder,submissionHistory:[{}]}}])await rejects(()=>validateDraft(broken),'Dado inválido aceito.');
 // Legacy ERROR has no authoritative classification; never infer 400 from a message.
 {
  const old:Order={...structuredClone(demoOrder),status:'ERROR',submissionId:crypto.randomUUID(),submission:{payload:submissionPayload(demoOrder),startedAt:new Date().toISOString(),message:'HTTP 400'}};
  check(validateDraft({...record,schemaVersion:2,order:old}).order.status==='ERROR','Schema 2 não recuperou.');
  await rejects(()=>assertOrderTransition(old,{...old,status:'DRAFT',submissionId:null,submission:undefined}),'Mensagem legada foi tratada como prova de rejeição.');
 }
 // Double click and receipt/rejection race: late requests cannot revive a rejected key.
 {
  const store=await factory();let order:Order={...structuredClone(demoOrder),orderId:crypto.randomUUID()};let revision=0;
  try{
   const provider=new MockERPProvider(store.ledger,()=>({scenario:'success',delayMs:1}));
   const c=new SubmissionCoordinator(()=>order,async value=>{revision=await store.save(value,revision);order=value;},provider);
   const outcomes=await Promise.allSettled([c.submit(submissionPayload(order)),c.submit(submissionPayload(order))]);
   check(outcomes.filter(r=>r.status==='fulfilled').length===1,'Duas confirmações simultâneas foram aceitas.');
   const receipt=(await store.ledger.find(order.submissionId!))!;
   const replays=await Promise.all(Array.from({length:20},()=>provider.createOrder(order,order.submissionId!)));
   check(replays.every(r=>r.erpOrderId===receipt.erpOrderId),'Replays duplicaram pedido.');
   const another={...order,orderId:crypto.randomUUID()};const id=crypto.randomUUID();const payload=submissionPayload(another);
   const rejection=await store.ledger.reject({submissionId:id,orderId:another.orderId,payload,rejectedAt:new Date().toISOString()});
   check(!('erpOrderId' in rejection),'Rejeição criou recibo.');
   await rejects(()=>provider.createOrder(another,id),'Criação tardia após rejeição aceita.');
   check(await store.ledger.find(id)===null,'Tentativa rejeitada criou recibo.');
   const raceId=crypto.randomUUID(),raceOrderId=crypto.randomUUID();
   const racePayload=submissionPayload({...another,orderId:raceOrderId});
   await Promise.allSettled([store.ledger.create({submissionId:raceId,orderId:raceOrderId,payload:racePayload,erpOrderId:'MOCK-RACE'}),store.ledger.reject({submissionId:raceId,orderId:raceOrderId,payload:racePayload,rejectedAt:new Date().toISOString()})]);
   const raceReceipt=await store.ledger.find(raceId),raceRejection=await store.ledger.findRejection(raceId);
   check(!!raceReceipt!==!!raceRejection,'Criação e rejeição coexistiram para a mesma tentativa.');

  }finally{await store.close();}
 }
 return {result:'PASS',checks,results,coverage:['correction','immutable history and log','fresh identity after changed review','auth','retry-after','unknown','recovery','terminal receipt','concurrency','durable rejection','schemas 1/2/3','invalid data preserved']};
}
