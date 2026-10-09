import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {authFixture} from '../fixtures.mjs';
import {database} from '../../db/client.ts';
import {readConfig} from '../../config/env.ts';
import {TinyService} from '../../integrations/tiny/service.ts';
import {CatalogRepository} from '../../catalog/repository.ts';
import {CatalogEngine} from '../../catalog/engine.ts';
import {Vault} from '../../security/crypto.ts';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tokens=n=>({access_token:'synthetic-access-'+n,refresh_token:'synthetic-refresh-'+n,token_type:'Bearer',expires_in:3600,refresh_expires_in:7200});
async function fixture(){
 const f=await authFixture(),p=f.sa.principal,control={refreshes:0,pages:0};
 const config=readConfig({DATABASE_URL:f.url,BACKEND_ORIGIN:'http://127.0.0.1:8790',BACKEND_ALLOW_LOOPBACK_HTTP:'yes',BACKEND_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('hex')}),BACKEND_ACTIVE_KEY:'v1',TINY_BACKEND_OAUTH_ENABLED:'yes',TINY_BACKEND_READ_ENABLED:'yes',TINY_BACKEND_REFRESH_ENABLED:'yes',TINY_BACKEND_SYNC_ENABLED:'yes',TINY_BACKEND_CLIENT_ID:'synthetic',TINY_BACKEND_CLIENT_SECRET:'synthetic'});
 const fetcher=async(url,init)=>{
  if(url.endsWith('/token')){if(init.body.get('grant_type')==='refresh_token'){control.refreshes++;control.refreshStarted?.resolve();await control.refreshGate?.promise;}return json(tokens(control.refreshes));}
  if(url.endsWith('/info'))return json({cpfCnpj:'11111111111',razaoSocial:'Synthetic',fantasia:'Synthetic'});
  control.pages++;control.pageStarted?.resolve();await control.pageGate?.promise;
  const u=new URL(url),offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit')),total=u.pathname.endsWith('/produtos')?75:0;
  return json({itens:Array.from({length:Math.min(limit,Math.max(0,total-offset))},(_,i)=>({id:String(offset+i+1)})),paginacao:{offset,limit,total}},control.pageStatus??200);
 };
 const service=new TinyService(f.db,config,fetcher,10000),repository=new CatalogRepository(f.db);
 const source=s=>({mode:'REAL',binding:x=>s.syncBinding(x),read:(x,r,o,l,v)=>s.readPage(x,r,o,l,v)});
 const options={real:true,fixture:false,pageSize:25,maxPages:100,maxRecords:2000,maxAttempts:3,intervalMs:4000};
 const engine=new CatalogEngine(repository,source(service),options);
 await service.configure(p,'11111111111');const u=new URL(await service.start(p)),cb=new URL(config.tiny.callback);cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'synthetic'}).toString();await service.callback(p,cb);await service.verify(p);
 const expire=()=>f.db.client`UPDATE erp_connections SET access_expires_at=NOW()-interval '1 second' WHERE organization_id=${p.organizationId}`;
 const due=()=>f.db.client`UPDATE sync_budgets SET next_at=NOW()-interval '1 second'`;
 const other=database(f.url),second=new TinyService(other,config,fetcher,10000),secondEngine=new CatalogEngine(new CatalogRepository(other),source(second),options);
 return {...f,p,control,service,engine,repository,second,secondEngine,expire,due,vault:new Vault(config.keys,config.activeKey),cleanup:async()=>{control.refreshGate?.resolve();control.pageGate?.resolve();await other.close();await f.cleanup();}};
}
test('7B.3 review PostgreSQL: paginated job crosses legitimate refresh and completes with stable connection epoch',async()=>{
 const f=await fixture();try{
  const binding=await f.service.syncBinding(f.p),job=await f.engine.start(f.p);await f.engine.step(f.p,job.id);await f.due();await f.engine.step(f.p,job.id);await f.expire();await f.due();
  await f.secondEngine.step(f.p,job.id);assert.equal(f.control.refreshes,1);assert.deepEqual(await f.service.syncBinding(f.p),binding);
  for(let i=0;i<4;i++){await f.due();await f.engine.step(f.p,job.id);}
  const got=await f.repository.job(f.p,job.id);assert.equal(got.status,'COMPLETED');assert.equal(got.records_received,75);assert.equal(got.error_code,null);
  const [row]=await f.db.client`SELECT token_version,connection_generation FROM erp_connections WHERE organization_id=${f.p.organizationId}`;assert.ok(row.token_version>binding.version);assert.equal(row.connection_generation,binding.version);assert.equal(await f.repository.manifest(f.p),null);
  await f.service.disconnect(f.p);await assert.rejects(f.repository.activate(f.p,job.snapshot_id,null,true),/CONNECTION_CHANGED/);
 }finally{await f.cleanup();}
});
test('7B.3 review PostgreSQL: two instances serialize refresh and reject delayed pages after disconnect/account replacement',async()=>{
 const f=await fixture();try{
  const binding=await f.service.syncBinding(f.p);await f.expire();f.control.refreshGate=deferred();f.control.refreshStarted=deferred();
  const refreshing=f.service.readPage(f.p,'products',0,25,binding.version);await f.control.refreshStarted.promise;
  await assert.rejects(f.second.readPage(f.p,'products',0,25,binding.version),/REFRESH_BUSY/);assert.equal(f.control.refreshes,1);f.control.refreshGate.resolve();await refreshing;f.control.refreshGate=undefined;
  for(const action of ['disconnect','configure']){
   if(action==='configure')await f.db.client`UPDATE erp_connections SET status='CONNECTED',account_verified=true,verified_account_identity=${binding.accountKey},access_token_encrypted=${f.vault.seal('synthetic-restored',f.p.organizationId,'access')},access_expires_at=NOW()+interval '1 hour' WHERE organization_id=${f.p.organizationId}`;
   const job=await f.engine.start(f.p);await f.due();f.control.pageGate=deferred();f.control.pageStarted=deferred();const running=f.engine.step(f.p,job.id).catch(e=>e);await f.control.pageStarted.promise;
   await assert.rejects(f.secondEngine.step(f.p,job.id),/JOB_BUSY/);
   if(action==='disconnect')await f.second.disconnect(f.p);else await f.second.configure(f.p,'22222222222');
   f.control.pageGate.resolve();assert.equal((await running).code,'CONNECTION_CHANGED');f.control.pageGate=undefined;
   const got=await f.repository.job(f.p,job.id);assert.equal(got.status,'FAILED');assert.equal(got.records_received,0);assert.equal(await f.repository.manifest(f.p),null);
   const [row]=await f.db.client`SELECT access_token_encrypted,status FROM erp_connections WHERE organization_id=${f.p.organizationId}`;assert.equal(row.access_token_encrypted,null);assert.equal(row.status,'DISCONNECTED');
  }
 }finally{await f.cleanup();}
});
test('7B.3 review PostgreSQL: late refresh cannot restore disconnected credentials; late 401 cannot revoke renewed credentials',async()=>{
 const f=await fixture();try{
  let binding=await f.service.syncBinding(f.p);f.control.pageGate=deferred();f.control.pageStarted=deferred();f.control.pageStatus=401;
  const old=f.service.readPage(f.p,'products',0,25,binding.version);await f.control.pageStarted.promise;await f.expire();
  // A second instance legitimately rotates via explicit verification while the old GET is in flight.
  const renewal=f.second.verify(f.p).catch(e=>e);assert.equal((await renewal).code,'READ_BUSY');assert.equal(f.control.refreshes,1);
  f.control.pageGate.resolve();assert.equal((await old).status,401);assert.equal((await f.service.status(f.p)).operationalReady,true);f.control.pageGate=undefined;
  await f.expire();f.control.refreshGate=deferred();f.control.refreshStarted=deferred();binding=await f.service.syncBinding(f.p);
  const late=f.service.readPage(f.p,'products',0,25,binding.version).catch(e=>e);await f.control.refreshStarted.promise;await f.second.disconnect(f.p);f.control.refreshGate.resolve();assert.equal((await late).code,'OPERATION_STALE');
  const [row]=await f.db.client`SELECT access_token_encrypted,refresh_token_encrypted,status FROM erp_connections WHERE organization_id=${f.p.organizationId}`;assert.equal(row.access_token_encrypted,null);assert.equal(row.refresh_token_encrypted,null);assert.equal(row.status,'DISCONNECTED');
 }finally{await f.cleanup();}
});
