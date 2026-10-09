import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authFixture} from '../fixtures.mjs';
import {CatalogRepository} from '../../catalog/repository.ts';
import {CatalogController} from '../../catalog/controller.ts';
import {createBackendServer} from '../../server/http.ts';
const sync={real:false,fixture:true,detail:false,pageSize:25,maxPages:500,maxRecords:10000,maxAttempts:3,intervalMs:4000};
test('7B.3D authenticated catalog API: RBAC, CSRF, queries, version pinning and synthetic 900 collection',async()=>{
 const f=await authFixture(),r=new CatalogRepository(f.db),config={origin:'http://127.0.0.1:8790',secure:false,sessionSeconds:3600,sync},controller=new CatalogController(r,config,{syncBinding:async()=>{assert.fail('REAL disabled');}}),logs=[];
 const server=createBackendServer(config,f.auth,undefined,e=>logs.push(e),controller);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));config.origin='http://127.0.0.1:'+server.address().port;
 const call=(path,method='GET',body,session=f.sa,extra={})=>fetch(config.origin+path,{method,headers:{Cookie:'atram_session='+session.token,...(method==='POST'?{Origin:config.origin,'Content-Type':'application/json','X-CSRF-Token':session.csrf}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await fetch(config.origin+'/api/catalog/manifest')).status,401);assert.equal((await call('/api/catalog/manifest')).status,200);
  await f.auth.createUser(f.sa.principal,'operator-catalog',f.password,'OPERADOR');const op=await f.auth.login('operator-catalog',f.password,undefined,'op-catalog');
  assert.equal((await call('/api/admin/sync/start','POST',{mode:'FIXTURE'},op)).status,403);assert.equal((await call('/api/admin/sync/start','POST',{mode:'REAL'})).status,403);assert.equal((await call('/api/admin/sync/start','POST',{mode:'FIXTURE'},f.sa,{'X-CSRF-Token':'bad'})).status,403);
  assert.equal((await call('/api/admin/sync/start','POST',{mode:'FIXTURE',url:'https://evil.example'})).status,400);
  const start=await call('/api/admin/sync/start','POST',{mode:'FIXTURE'});assert.equal(start.status,200);const j=await start.json();assert.equal(j.mode,'FIXTURE');assert.ok(!JSON.stringify(j).includes('account_key'));
  for(let i=0;i<100;i++){const step=await call('/api/admin/sync/step','POST',{id:j.id});assert.equal(step.status,200);if((await step.json()).status==='COMPLETED')break;}
  const status=await call('/api/admin/sync/status?id='+j.id);assert.equal((await status.json()).status,'COMPLETED');assert.equal((await call('/api/admin/catalog/activate','POST',{version:j.snapshotId,expectedVersion:null})).status,200);
  const manifest=await (await call('/api/catalog/manifest','GET',undefined,op)).json();assert.equal(manifest.resources.products.count,900);
  const page=await call('/api/catalog/products?version='+manifest.version+'&offset=850&limit=50','GET',undefined,op);assert.equal(page.status,200);assert.equal((await page.json()).items.length,50);
  assert.equal((await call('/api/catalog/products?version='+manifest.version+'&limit=101')).status,400);assert.equal((await call('/api/catalog/products?version='+manifest.version+'&offset=0&offset=1')).status,400);assert.equal((await call('/api/catalog/products?version='+manifest.version+'&url=https://evil.example')).status,400);
  assert.equal((await call('/api/catalog/products?version='+manifest.version,'GET',undefined,f.sb)).status,404);assert.equal((await call('/api/catalog/quarantine?version='+manifest.version,'GET',undefined,op)).status,403);
  await f.db.client`UPDATE catalog_snapshots SET mode='REAL',commercial='PENDING',manifest=jsonb_set(manifest,'{mode}','"REAL"'::jsonb) WHERE id=${manifest.version}`;
  assert.equal((await call('/api/catalog/manifest','GET',undefined,op)).status,403);assert.equal((await call('/api/catalog/products?version='+manifest.version,'GET',undefined,op)).status,403);
  await f.auth.logout(op.principal);assert.equal((await call('/api/catalog/status','GET',undefined,op)).status,401);assert.ok(!JSON.stringify(logs).includes(f.sa.token));assert.ok(!JSON.stringify(logs).includes(f.password));
 }finally{await new Promise(resolve=>server.close(resolve));await f.cleanup();}
});
