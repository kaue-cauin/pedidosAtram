import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authFixture} from '../fixtures.mjs';
import {CatalogEngine} from '../../catalog/engine.ts';
import {CatalogRepository} from '../../catalog/repository.ts';
import {IndexedCatalogCache} from '../../../repositories/catalog-cache.ts';
import {LocalCatalog} from '../../../services/catalog-client.ts';
import {syntheticCatalogScope,syntheticCatalogTransport} from '../../../services/catalog-fixture.ts';
import {DraftRepository} from '../../../repositories/draft-repository.ts';
import {demoOrder} from '../../../domain/mock-data.ts';
const options={real:false,fixture:true,pageSize:25,maxPages:100,maxRecords:2000,maxAttempts:3,intervalMs:4000};
const source=(n,failOffset)=>({mode:'FIXTURE',read:async(_p,r,offset,limit)=>{if(r==='products'&&offset===failOffset)throw new Error('synthetic transport timeout');return {status:200,quota:{},data:{itens:r==='products'?Array.from({length:Math.min(limit,n-offset)},(_,i)=>({id:String(offset+i+1)})):[],paginacao:{offset,limit,total:r==='products'?n:0}}};}});
async function finish(e,p,id){for(let i=0;i<110;i++)if((await e.step(p,id)).status==='COMPLETED')return;assert.fail('not complete');}
test('7B.3E failures at first/middle/near-end keep last active version and isolate simultaneous organizations',async()=>{
 const f=await authFixture(),r=new CatalogRepository(f.db),p=f.sa.principal,b=f.sb.principal;
 try{
  const initial=new CatalogEngine(r,source(10),options),j=await initial.start(p);await finish(initial,p,j.id);await r.activate(p,j.snapshot_id,null);
  for(const offset of [0,50,75]){
   const e=new CatalogEngine(r,source(100,offset),{...options,maxAttempts:1}),next=await e.start(p);
   for(let page=0;page<offset/25;page++)await e.step(p,next.id);await assert.rejects(e.step(p,next.id));assert.equal((await r.job(p,next.id)).status,'FAILED');assert.equal((await r.manifest(p)).version,j.snapshot_id);
   await assert.rejects(r.activate(p,next.snapshot_id,j.snapshot_id,true),/SNAPSHOT_NOT_READY/);
  }
  const aJob=await new CatalogEngine(r,source(1),options).start(p),bEngine=new CatalogEngine(r,source(1),options),bJob=await bEngine.start(b);
  await assert.rejects(bEngine.step(b,aJob.id),/JOB_NOT_FOUND/);await finish(bEngine,b,bJob.id);assert.equal((await r.manifest(p)).version,j.snapshot_id);assert.equal(await r.manifest(b),null);await r.activate(b,bJob.snapshot_id,null);
  assert.equal((await r.manifest(b)).version,bJob.snapshot_id);await f.auth.logout(b);await assert.rejects(r.activate(b,bJob.snapshot_id,bJob.snapshot_id),/UNAUTHENTICATED/);
 }finally{await f.cleanup();}
});
test('7B.3E real draft IndexedDB adapter preserves captured order during catalog update and logout',async()=>{
 const drafts=new DraftRepository('stage7b3-drafts-'+randomUUID()),cache=new IndexedCatalogCache('stage7b3-cache-'+randomUUID()),local=new LocalCatalog(syntheticCatalogScope,cache),order=structuredClone({...demoOrder,orderId:randomUUID()});
 try{
  await drafts.save(order,0);const bytes=JSON.stringify(order);await local.update(await syntheticCatalogTransport());local.activate({query:'',selection:false,editing:false});await local.logout();
  assert.equal(JSON.stringify((await drafts.list())[0].order),bytes);assert.equal((await drafts.list())[0].revision,1);assert.equal(await cache.read(syntheticCatalogScope),null);
 }finally{await drafts.close();await cache.close();}
});
