import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {authFixture} from '../fixtures.mjs';
import {readConfig} from '../../config/env.ts';
import {TinyService} from '../../integrations/tiny/service.ts';
import {Vault,hash} from '../../security/crypto.ts';
import {CatalogRepository} from '../../catalog/repository.ts';
import {CatalogEngine} from '../../catalog/engine.ts';
const options={real:true,fixture:false,pageSize:25,maxPages:100,maxRecords:2000,maxAttempts:3,intervalMs:4000};
test('7B.3B isolated paginated reader: fixed GET paths, lossless prices and stale connection fencing',async()=>{
 const f=await authFixture(),p=f.sa.principal;let calls=0,release,started;
 try{
  const config=readConfig({DATABASE_URL:f.url,BACKEND_ORIGIN:'http://127.0.0.1:8790',BACKEND_ALLOW_LOOPBACK_HTTP:'yes',BACKEND_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('hex')}),BACKEND_ACTIVE_KEY:'v1',TINY_BACKEND_OAUTH_ENABLED:'yes',TINY_BACKEND_READ_ENABLED:'yes',TINY_BACKEND_SYNC_ENABLED:'yes',TINY_BACKEND_CLIENT_ID:'synthetic',TINY_BACKEND_CLIENT_SECRET:'synthetic'}),vault=new Vault(config.keys,config.activeKey);
  const service=new TinyService(f.db,config,async(url,init)=>{
   calls++;assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(new URL(url).pathname,'/public-api/v3/produtos');assert.equal(new URL(url).search,'?limit=25&offset=0');started?.();await release?.promise;
   return new Response('{"itens":[{"id":9007199254740993,"sku":"0001","precos":{"preco":123.456789012345678901}}],"paginacao":{"offset":0,"limit":25,"total":1}}',{headers:{'Content-Type':'application/json'}});
  });
  await service.configure(p,'11111111111');await f.db.client`UPDATE erp_connections SET status='CONNECTED',account_verified=true,verified_account_identity=${hash('synthetic-account')},access_token_encrypted=${vault.seal('synthetic-access',p.organizationId,'access')},access_expires_at=NOW()+interval '1 hour' WHERE organization_id=${p.organizationId}`;
  const binding=await service.syncBinding(p),data=await service.readPage(p,'products',0,25,binding.version);
  assert.equal(data.data.itens[0].precos.preco,'123.456789012345678901');assert.equal(data.data.itens[0].id,'9007199254740993');
  await assert.rejects(service.readPage(p,'https://evil.example',0,25,binding.version),/INPUT_INVALID/);assert.equal(calls,1);
  const disabled=new TinyService(f.db,{...config,sync:{...config.sync,real:false}},()=>{assert.fail('unexpected fetch');});await assert.rejects(disabled.syncBinding(p),/REAL_SYNC_DISABLED/);
  let resolve;release={promise:new Promise(r=>resolve=r)};const ready=new Promise(r=>started=r);const pending=service.readPage(p,'products',0,25,binding.version);await ready;await service.disconnect(p);resolve();await assert.rejects(pending,/CONNECTION_CHANGED/);
 }finally{await f.cleanup();}
});
test('7B.3B bounded HTTP retries preserve active head, persist pauses and reject unauthorized starts',async()=>{
 const f=await authFixture(),p=f.sa.principal,r=new CatalogRepository(f.db);
 try{
  for(const status of [400,401,403,429,500]){
   const source={mode:'FIXTURE',read:async()=>({status,quota:{retryAfterSeconds:120},data:undefined})},e=new CatalogEngine(r,source,{...options,real:false,fixture:true}),j=await e.start(p);
   await assert.rejects(e.step(p,j.id));let got=await r.job(p,j.id);
   assert.equal(got.status,[429,500].includes(status)?'RETRY_WAIT':'FAILED');assert.equal(got.attempt_count,1);
   if(status===429)assert.ok(got.retry_after.getTime()>Date.now()+118000);
   if(['RETRY_WAIT'].includes(got.status)){
    for(let i=0;i<2;i++){await f.db.client`UPDATE sync_jobs SET retry_after=NOW()-interval '1 second' WHERE id=${j.id}`;await assert.rejects(e.step(p,j.id));}
    got=await r.job(p,j.id);assert.equal(got.status,'FAILED');assert.equal(got.attempt_count,3);
   }
   assert.equal(await r.manifest(p),null);
  }
  const denied=new CatalogEngine(r,{mode:'REAL',binding:async()=>{assert.fail('must gate before binding');},read:async()=>{assert.fail('unexpected fetch');}},{...options,real:false});await assert.rejects(denied.start(p),/REAL_SYNC_DISABLED/);
  await assert.rejects(new CatalogEngine(r,{mode:'FIXTURE',read:async()=>{assert.fail('unexpected fetch');}},{...options,fixture:true}).start({...p,role:'OPERADOR'}),/FORBIDDEN/);
 }finally{await f.cleanup();}
});
