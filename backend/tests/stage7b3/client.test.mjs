import 'fake-indexeddb/auto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {IndexedCatalogCache} from '../../../repositories/catalog-cache.ts';
import {LocalCatalog,checksum} from '../../../services/catalog-client.ts';
const scope={organizationId:randomUUID(),userId:randomUUID(),projection:'SYNTHETIC'};
async function transport(n=900,transform=x=>x){
 const version=randomUUID(),resources={products:Array.from({length:n},(_,i)=>({erpId:String(i+1),name:'Produto '+i,code:String(i+1).padStart(4,'0'),ean:'000123'+i,unitOriginal:'CX',commercial:'SYNTHETIC_ONLY'})),contacts:[],sellers:[],priceLists:[]},spec={};
 for(const [key,list]of Object.entries(resources))spec[key]={count:list.length,complete:true,checksum:await checksum(list)};
 const manifest={version,organizationId:scope.organizationId,mode:'FIXTURE',state:'ACTIVE',commercial:'SYNTHETIC_ONLY',createdAt:new Date().toISOString(),publishedAt:new Date().toISOString(),resources:spec,checksum:await checksum(spec),cache:{maxAgeSeconds:3600,offlineAllowed:true},compatibility:'TECHNICAL_ONLY'};let calls=0;
 return {version,resources,manifestValue:manifest,get calls(){return calls;},manifest:async()=>structuredClone(manifest),page:async(v,r,offset,limit)=>{calls++;return transform({version:v,resource:r,offset,limit,items:structuredClone(resources[r].slice(offset,offset+limit))});}};
}
test('7B.3D complete checksummed IndexedDB cache, pure local search, quiet activation and draft captures',async()=>{
 const cache=new IndexedCatalogCache('stage7b3-'+randomUUID()),local=new LocalCatalog(scope,cache);
 try{
  const a=await transport();const timings=await local.update(a);assert.equal(a.calls,18);assert.ok(timings.indexedDbMs>=0);assert.equal(local.version,null);
  assert.equal(await local.activate({query:'typing',selection:false,editing:false}),false);assert.equal(await local.activate({query:'',selection:true,editing:false}),false);assert.equal(await local.activate({query:'',selection:false,editing:true}),false);assert.equal(await local.activate({query:'',selection:false,editing:false}),true);
  const captured=structuredClone(local.search('0001')[0]);for(let i=0;i<1000;i++)local.search('produto 89');assert.equal(a.calls,18);assert.equal(local.search('0001230')[0].erpId,'1');
  const b=await transport(900,x=>x);b.resources.products[0].name='Alterado';b.resources.products[0].commercial='BLOCKED';b.manifestValue.resources.products.checksum=await checksum(b.resources.products);b.manifestValue.checksum=await checksum(b.manifestValue.resources);
  await local.update(b);assert.equal(local.search('0001')[0].name,captured.name);await local.activate({query:'',selection:false,editing:false});assert.equal(local.search('0001')[0].commercial,'BLOCKED');assert.equal(captured.name,'Produto 0');
  const recovered=new LocalCatalog(scope,cache);assert.equal(await recovered.recover(true),true);assert.equal(recovered.version,b.version);assert.equal(recovered.search('0001')[0].name,'Alterado');
  await recovered.switchScope({...scope,organizationId:randomUUID()});assert.equal(recovered.search('0001').length,0);assert.equal(await recovered.recover(true),false);
 }finally{await cache.close();}
});
test('7B.3D interrupted/wrong-checksum/mixed-version downloads retain the last good cache; logout fences writes',async()=>{
 const cache=new IndexedCatalogCache('stage7b3-'+randomUUID()),local=new LocalCatalog(scope,cache),good=await transport(100);try{
  await local.update(good);await local.activate({query:'',selection:false,editing:false});
  for(const mode of ['wrong-hash','mixed-version','interrupted']){let n=0;const bad=await transport(100,p=>{n++;if(n===2){if(mode==='wrong-hash')p.items[0].name='Corrupted';if(mode==='mixed-version')p.version=randomUUID();if(mode==='interrupted')throw new Error('OFFLINE');}return p;});await assert.rejects(local.update(bad));assert.equal(local.version,good.version);assert.equal((await cache.read(scope)).manifest.version,good.version);}
  const revoked=await transport(100);revoked.page=async()=>{throw new Error('CATALOG_HTTP_401');};await assert.rejects(local.update(revoked));assert.equal(local.version,null);assert.equal(await cache.read(scope),null);
  let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r),late=await transport(100),read=late.page;late.page=async(...args)=>{started();await gate;return read(...args);};const pending=local.update(late);await ready;await local.logout();release();await assert.rejects(pending,/SCOPE_CHANGED/);assert.equal(await cache.read(scope),null);assert.equal(local.search('produto').length,0);
 }finally{await cache.close();}
});
test('7B.3D expiry, scope and cache compare-and-swap; no REAL data persisted',async()=>{
 const cache=new IndexedCatalogCache('stage7b3-'+randomUUID()),local=new LocalCatalog(scope,cache);try{
  const t=await transport(1);await local.update(t);await local.activate({query:'',selection:false,editing:false});const record=await cache.read(scope);
  await assert.rejects(cache.prepare(record,null,()=>true),/CACHE_CONFLICT/);
  const clock=Date.now;try{Date.now=()=>clock()+7200000;assert.equal(await new LocalCatalog(scope,cache).recover(true),false);}finally{Date.now=clock;}
  const privateScope={...scope,projection:'TECHNICAL_ADMIN'},real=new LocalCatalog(privateScope,cache),rt=await transport(1);rt.manifestValue.mode='REAL';rt.manifestValue.commercial='PENDING';rt.manifestValue.cache.offlineAllowed=false;await real.update(rt);await real.activate({query:'',selection:false,editing:false});assert.equal(await cache.read(privateScope),null);assert.equal(real.search('produto').length,1);
  const other=new LocalCatalog({...scope,organizationId:randomUUID()},cache);await assert.rejects(other.update(rt),/SCOPE_CHANGED/);
 }finally{await cache.close();}
});

test('7B.3 review: prepared B survives reload without becoming active; CAS and failed activation preserve A',async()=>{
 const cache=new IndexedCatalogCache('review-'+randomUUID()),local=new LocalCatalog(scope,cache),quiet={query:'',selection:false,editing:false};
 try{
  const a=await transport(100),b=await transport(100);await local.update(a);await local.activate(quiet);await local.update(b);
  const reload=new LocalCatalog(scope,cache);assert.equal(await reload.recover(true),true);assert.equal(reload.version,a.version);assert.equal(reload.pendingVersion,b.version);
  await assert.rejects(cache.activate(scope,b.version,a.version,()=>false),/SCOPE_CHANGED/);assert.equal((await cache.read(scope)).manifest.version,a.version);assert.equal((await cache.readPrepared(scope)).manifest.version,b.version);
  const other=new LocalCatalog(scope,cache);await other.recover();assert.equal(await reload.activate(quiet),true);await assert.rejects(other.activate(quiet),/CACHE_CONFLICT/);
  const after=new LocalCatalog(scope,cache);await after.recover();assert.equal(after.version,b.version);assert.equal(after.pendingVersion,null);
  await assert.rejects(cache.prepare(await cache.read(scope),b.version,()=>true),/VERSION_REUSED/);
  await local.logout();assert.equal(await cache.read(scope),null);assert.equal(await cache.readPrepared(scope),null);
 }finally{await cache.close();}
});
