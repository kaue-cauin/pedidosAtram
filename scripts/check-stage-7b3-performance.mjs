import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {LocalCatalog} from '../services/catalog-client.ts';
import {IndexedCatalogCache} from '../repositories/catalog-cache.ts';
import {syntheticCatalogScope,syntheticCatalogTransport} from '../services/catalog-fixture.ts';
import {DraftRepository} from '../repositories/draft-repository.ts';
import {AutosaveQueue} from '../services/autosave-queue.ts';
import {initialItemsState,changeItems} from '../domain/order-state.ts';
import {performanceItems,percentile,testSizes} from '../domain/performance.ts';
import {demoOrder} from '../domain/mock-data.ts';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),rows=[];
for(const network of [0,50,100,300,1000,'OFFLINE'])for(const size of testSizes){
 const drafts=new DraftRepository('stage7b3-benchmark-drafts-'+randomUUID()),cache=new IndexedCatalogCache('stage7b3-benchmark-cache-'+randomUUID()),local=new LocalCatalog(syntheticCatalogScope,cache),samples=[],searchSamples=[],metrics=[];let revision=0,state=initialItemsState(performanceItems(size)),latest={...demoOrder,orderId:randomUUID(),items:state.items};
 const queue=new AutosaveQueue(async order=>{const r=await drafts.save(order,revision);revision=r.revision;return r;},{onMetric:metric=>metrics.push(metric)});
 try{
  await local.update(await syntheticCatalogTransport());local.activate({query:'',selection:false,editing:false});queue.schedule(latest);await queue.flush();
  const baseline=[];for(let i=0;i<50;i++){const start=performance.now();changeItems(state,{type:'add',item:{...state.items[0],id:'baseline-'+i}});baseline.push(performance.now()-start);}
  let calls=0;const transport=await syntheticCatalogTransport(5),read=transport.page;transport.page=(...args)=>{calls++;return read(...args);};
  const transfer=local.update(transport),networkProbe=network==='OFFLINE'?Promise.resolve('offline'):sleep(network);const unchanged=JSON.stringify(state.items[0]);
  for(let i=0;i<12;i++){
   const start=performance.now();state=changeItems(state,{type:'add',item:{...state.items[0],id:'entry-'+i}});latest={...latest,items:state.items};queue.schedule(latest);if(i>=2)samples.push(performance.now()-start);
   const searchStart=performance.now();local.search('gran');searchSamples.push(performance.now()-searchStart);await sleep(10);
  }
  const catalog=await transfer;await queue.flush();await networkProbe;
  assert.equal(calls,18);assert.equal(JSON.stringify(state.items[0]),unchanged);assert.equal(JSON.stringify((await drafts.list())[0].order),JSON.stringify(latest));assert.ok(queue.getSnapshot().dirty===false);assert.ok(samples.length===10);
  const activationStart=performance.now();assert.equal(local.activate({query:'',selection:false,editing:false}),true);const activationMs=performance.now()-activationStart;
  const p95=values=>percentile(values,.95),row={size,network,autosave:true,fixtureProducts:900,samples:10,baselineModelP95Ms:p95(baseline),modelAndScheduleP95Ms:p95(samples),localSearchP95Ms:p95(searchSamples),indexedDbEmulatorP95Ms:p95(metrics.map(m=>m.indexedDbMs)),autosaveP95Ms:p95(metrics.map(m=>m.autosaveMs)),catalog:{...catalog,activationMs},transferPages:calls,recovered:true};
  assert.ok(row.modelAndScheduleP95Ms<50,'model/schedule regression above 50ms');assert.ok(row.localSearchP95Ms<50,'local search regression above 50ms');rows.push(row);
 }finally{queue.dispose();await drafts.close();await cache.close();}
}
const report={result:'PASS',recordedAt:new Date().toISOString(),runtime:process.version,method:'Node model/search/schedule + native draft/catalog adapters with fake-indexeddb 6.2.5. 10 measured additions after 2 warmups. Network probe independent of edits; 900-product paged background transfer. This is NOT React/DOM UI, native browser IndexedDB or a browser-offline measurement. Browser matrix is available at /diagnostico-etapa7b3/ and remains required for homologation.',rows};
await mkdir('docs/etapa7B3',{recursive:true});await writeFile('docs/etapa7B3/PERFORMANCE-NODE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:report.result,scenarios:rows.length,maxModelAndScheduleP95Ms:Math.max(...rows.map(r=>r.modelAndScheduleP95Ms)),maxSearchP95Ms:Math.max(...rows.map(r=>r.localSearchP95Ms)),allRecovered:rows.every(r=>r.recovered),browserUiMeasured:false},null,2));
