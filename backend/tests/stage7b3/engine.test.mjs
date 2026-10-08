import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authFixture} from '../fixtures.mjs';
import {CatalogRepository} from '../../catalog/repository.ts';
import {CatalogEngine} from '../../catalog/engine.ts';
import {AccountBudget} from '../../catalog/budget.ts';
import {database} from '../../db/client.ts';
import {hash} from '../../security/crypto.ts';
const options={real:false,fixture:true,pageSize:25,maxPages:100,maxRecords:2000,maxAttempts:3,intervalMs:4000};
const source=n=>({mode:'FIXTURE',read:async(_p,r,offset,limit)=>({status:200,quota:{},data:{itens:r==='products'?Array.from({length:Math.min(limit,n-offset)},(_,i)=>({id:String(offset+i+1)})):[],paginacao:{offset,limit,total:r==='products'?n:0}}})});
async function finish(e,p,id){for(let i=0;i<110;i++){const r=await e.step(p,id);if(r.status==='COMPLETED')return;}assert.fail('bounded job did not finish');}
test('7B.3B full collection 0/1/10/50/100/900/1000, atomic checkpoints and no automatic publication',async()=>{
 const f=await authFixture(),p=f.sa.principal,r=new CatalogRepository(f.db);
 try{for(const n of [0,1,10,50,100,900,1000]){
  const e=new CatalogEngine(r,source(n),options),j=await e.start(p);await finish(e,p,j.id);
  const got=await r.job(p,j.id);assert.equal(got.status,'COMPLETED');assert.equal(got.records_received,n);assert.equal(got.records_validated,n);assert.equal(got.checkpoint.completed.length,4);assert.equal(got.pages_processed,Math.max(1,Math.ceil(n/25))+3);
  assert.equal(await r.manifest(p),null);const [s]=await f.db.client`SELECT status,manifest FROM catalog_snapshots WHERE id=${j.snapshot_id}`;assert.equal(s.status,'READY');assert.equal(s.manifest.resources.products.count,n);
 }}finally{await f.cleanup();}
});
test('7B.3B page inconsistencies, duplicates, failure, cancellation, recovery and two-instance lease',async()=>{
 const f=await authFixture(),p=f.sa.principal,r=new CatalogRepository(f.db),other=database(f.url);
 try{
  for(const kind of ['offset','total','empty','duplicate','missing']){
   const src=source(50),read=src.read;src.read=async(...args)=>{const result=await read(...args);if(args[2]===25){if(kind==='offset')result.data.paginacao.offset=0;if(kind==='total')result.data.paginacao.total=51;if(kind==='empty')result.data.itens=[];if(kind==='duplicate')result.data.itens[0].id='1';if(kind==='missing')delete result.data.itens[0].id;}return result;};
   const e=new CatalogEngine(r,src,options),j=await e.start(p);await e.step(p,j.id);await assert.rejects(e.step(p,j.id));assert.equal((await r.job(p,j.id)).status,'FAILED');assert.equal(await r.manifest(p),null);
  }
  let release,started;const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);const src=source(50),read=src.read;
  src.read=async(...args)=>{started();await gate;return read(...args);};
  const e=new CatalogEngine(r,src,options),j=await e.start(p),pending=e.step(p,j.id);await ready;
  const second=new CatalogEngine(new CatalogRepository(other),source(50),options);await assert.rejects(second.step(p,j.id),/JOB_BUSY/);await e.cancel(p,j.id);release();await assert.rejects(pending,/EXECUTION_STALE/);assert.equal((await r.job(p,j.id)).status,'CANCELLED');assert.equal((await f.db.client`SELECT * FROM catalog_entries WHERE snapshot_id=${j.snapshot_id}`).length,0);
  const restart=new CatalogEngine(r,source(50),options),jr=await restart.start(p);await restart.step(p,jr.id);
  await f.db.client`UPDATE sync_jobs SET execution_id=gen_random_uuid(),lease_until=NOW()-interval '1 second' WHERE id=${jr.id}`;
  await assert.rejects(second.step(p,jr.id),/RECOVERY_REQUIRED/);await second.resume(p,jr.id);assert.equal((await r.job(p,jr.id)).records_received,0);await finish(second,p,jr.id);assert.equal((await r.job(p,jr.id)).records_validated,50);
  const revoked=new CatalogEngine(r,source(1),options),jv=await revoked.start(p);await f.auth.logout(p);await assert.rejects(revoked.step(p,jv.id),/UNAUTHENTICATED/);
 }finally{await other.close();await f.cleanup();}
});
test('7B.3B account budget shared across instances, reservation and persistent Retry-After',async()=>{
 const f=await authFixture(),other=database(f.url),a=new AccountBudget(f.db),b=new AccountBudget(other),key=hash('synthetic-shared-account');
 try{
  const lease=await a.claim(key);await assert.rejects(b.claim(key),/BUDGET_WAIT/);await a.release(key,lease,{remaining:1,resetSeconds:60,retryAfterSeconds:120},429);
  const [row]=await other.client`SELECT * FROM sync_budgets WHERE key=${key}`;assert.ok(row.pause_until.getTime()>Date.now()+118000);await assert.rejects(b.claim(key,true),/BUDGET_WAIT/);
  await f.db.client`UPDATE sync_budgets SET pause_until=NULL,next_at=NOW()-interval '1 second',reset_at=NOW()-interval '1 second' WHERE key=${key}`;const next=await b.claim(key);await b.release(key,next);assert.ok(next!==lease);
 }finally{await other.close();await f.cleanup();}
});
