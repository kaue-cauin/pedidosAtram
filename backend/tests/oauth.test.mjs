import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { authFixture } from './fixtures.mjs';
import { readConfig } from '../config/env.ts';
import { TinyService } from '../integrations/tiny/service.ts';
import { Vault } from '../security/crypto.ts';
import { database } from '../db/client.ts';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const company={cpfCnpj:'11111111111',razaoSocial:'Synthetic',fantasia:'Synthetic'};
const tokens=(access='synthetic-access',refresh='synthetic-refresh')=>({access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,refresh_expires_in:7200});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(fetcher,timeout=1000){
 const f=await authFixture();const keys={v1:randomBytes(32).toString('hex')};
 const config=readConfig({DATABASE_URL:f.url,BACKEND_ORIGIN:'http://127.0.0.1:8790',BACKEND_ALLOW_LOOPBACK_HTTP:'yes',BACKEND_ENCRYPTION_KEYS:JSON.stringify(keys),BACKEND_ACTIVE_KEY:'v1',TINY_BACKEND_OAUTH_ENABLED:'yes',TINY_BACKEND_READ_ENABLED:'yes',TINY_BACKEND_REFRESH_ENABLED:'yes',TINY_BACKEND_CLIENT_ID:'synthetic-client',TINY_BACKEND_CLIENT_SECRET:'synthetic-client-secret'});
 const service=new TinyService(f.db,config,fetcher,timeout);await service.configure(f.sa.principal,company.cpfCnpj);
 return {...f,config,service,vault:new Vault(config.keys,config.activeKey)};
}
async function authorize(f){const url=new URL(await f.service.start(f.sa.principal));const callback=new URL(f.config.tiny.callback);callback.search=new URLSearchParams({state:url.searchParams.get('state'),code:'synthetic-code'}).toString();await f.service.callback(f.sa.principal,callback);return callback;}
async function expire(f){await f.db.client`UPDATE erp_connections SET access_expires_at=NOW()-interval '1 second' WHERE organization_id=${f.sa.principal.organizationId}`;}
test('7B.2C OAuth S256, persisted encrypted tokens, explicit verification, scope and replay',async()=>{
 let exchanges=0;const requests=[];
 const f=await fixture(async(url,init)=>{requests.push({url,method:init.method});if(url.endsWith('/token')){exchanges++;const b=init.body;assert.equal(b.get('code_verifier').length,43);return json(tokens());}return json(company);});
 try{
  const authURL=new URL(await f.service.start(f.sa.principal));assert.equal(authURL.searchParams.get('code_challenge_method'),'S256');assert.equal(authURL.searchParams.get('code_challenge').length,43);
  const url=new URL(f.config.tiny.callback);url.search=new URLSearchParams({state:authURL.searchParams.get('state'),code:'synthetic-code'}).toString();
  await assert.rejects(f.service.callback(f.sb.principal,url),/INVALID_STATE/);
  const invalid=new URL(url);invalid.searchParams.set('state','x'.repeat(43));await assert.rejects(f.service.callback(f.sa.principal,invalid),/INVALID_STATE/);
  await f.service.callback(f.sa.principal,url);assert.equal(exchanges,1);await assert.rejects(f.service.callback(f.sa.principal,url),/INVALID_STATE/);
  let status=await f.service.status(f.sa.principal);assert.equal(status.oauthConnected,true);assert.equal(status.accountVerified,false);assert.equal(status.operationalReady,false);assert.equal(requests.filter(r=>r.method==='GET').length,0);
  const [row]=await f.db.client`SELECT * FROM erp_connections WHERE organization_id=${f.a.organizationId}`;assert.ok(!JSON.stringify(row).includes('synthetic-access'));assert.ok(!JSON.stringify(row).includes(company.cpfCnpj));
  assert.equal((await f.service.status(f.sb.principal)).status,'NOT_CONFIGURED');
  await assert.rejects(f.service.read(f.sa.principal,'products'),/ACCOUNT_NOT_VERIFIED/);
  await f.service.verify(f.sa.principal);status=await f.service.status(f.sa.principal);assert.equal(status.operationalReady,true);
  const afterRestart=database(f.url);try{assert.equal((await new TinyService(afterRestart,f.config,async()=>json(company)).status(f.sa.principal)).accountVerified,true);}finally{await afterRestart.close();}
  await f.service.disconnect(f.sa.principal);assert.equal((await f.service.status(f.sa.principal)).oauthConnected,false);
  assert.ok(requests.every(r=>r.method==='GET'||r.url.endsWith('/token')));
 }finally{await f.cleanup();}
});
test('7B.2C expired state, invalid callback/token, denial, disabled flags and membership revocation',async()=>{
 let data=tokens(),calls=0;const f=await fixture(async()=>{calls++;return json(data);});
 try{
  const callback=()=>new URL(f.config.tiny.callback);
  let u=new URL(await f.service.start(f.sa.principal)),cb=callback();cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'code'}).toString();
  await f.db.client`UPDATE oauth_attempts SET expires_at=NOW()-interval '1 second'`;await assert.rejects(f.service.callback(f.sa.principal,cb),/INVALID_STATE/);assert.equal(calls,0);
  u=new URL(await f.service.start(f.sa.principal));cb=callback();cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'code'}).toString();
  const other=new URL(cb);other.pathname='/wrong';await assert.rejects(f.service.callback(f.sa.principal,other),/INVALID_CALLBACK/);
  data={access_token:'private-value-do-not-log',token_type:'Bearer',expires_in:-1};await assert.rejects(f.service.callback(f.sa.principal,cb),/INVALID_TOKEN/);await assert.rejects(f.service.callback(f.sa.principal,cb),/INVALID_STATE/);
  u=new URL(await f.service.start(f.sa.principal));cb=callback();cb.search=new URLSearchParams({state:u.searchParams.get('state'),error:'access_denied'}).toString();await assert.rejects(f.service.callback(f.sa.principal,cb),/AUTH_DENIED/);
  const disabled=new TinyService(f.db,{...f.config,tiny:{...f.config.tiny,enabled:false,reads:false,refresh:false}},()=>{throw Error('must not fetch');});
  await assert.rejects(disabled.start(f.sa.principal),/REAL_OAUTH_DISABLED/);await assert.rejects(disabled.verify(f.sa.principal),/REAL_READ_DISABLED/);
  u=new URL(await f.service.start(f.sa.principal));cb=callback();cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'code'}).toString();
  await f.auth.logout(f.sa.principal);await assert.rejects(f.service.callback(f.sa.principal,cb),/INVALID_STATE/);
 }finally{await f.cleanup();}
});
test('7B.2C two instances: one refresh, rotated credentials atomic and old expiry preserved without rotation',async()=>{
 let refreshes=0,gate,started;let rotate=true;
 const f=await fixture(async(url,init)=>{
  if(!url.endsWith('/token'))return json(company);
  if(init.body.get('grant_type')==='authorization_code')return json(tokens());
  refreshes++;started?.resolve();await gate?.promise;return json(rotate?tokens('new-access','rotated-refresh'):{access_token:'newer-access',token_type:'Bearer',expires_in:3600});
 });const other=database(f.url),second=new TinyService(other,f.config,async(url)=>{if(url.endsWith('/token')){refreshes++;return json(tokens());}return json(company);});
 try{
  await authorize(f);await f.service.verify(f.sa.principal);await expire(f);gate=deferred();started=deferred();const first=f.service.verify(f.sa.principal);await started.promise;
  const attempts=await Promise.allSettled(Array.from({length:10},()=>second.verify(f.sa.principal)));assert.ok(attempts.every(x=>x.status==='rejected'&&x.reason.code==='REFRESH_BUSY'));assert.equal(refreshes,1);
  gate.resolve();await first;let [row]=await f.db.client`SELECT * FROM erp_connections WHERE organization_id=${f.a.organizationId}`;assert.equal(f.vault.open(row.refresh_token_encrypted,f.a.organizationId,'refresh'),'rotated-refresh');assert.equal(row.refresh_lease,null);
  const oldExpiry=row.refresh_expires_at.getTime();rotate=false;gate=undefined;started=undefined;await expire(f);await f.service.verify(f.sa.principal);
  [row]=await f.db.client`SELECT * FROM erp_connections WHERE organization_id=${f.a.organizationId}`;assert.equal(row.refresh_expires_at.getTime(),oldExpiry);assert.equal(f.vault.open(row.refresh_token_encrypted,f.a.organizationId,'refresh'),'rotated-refresh');assert.equal(refreshes,2);
 }finally{await other.close();await f.cleanup();}
});
test('7B.2C disconnect and newer authorization fence late refresh, abandoned lease never retried',async()=>{
 const gate=deferred(),started=deferred();let refreshes=0;
 const f=await fixture(async(url,init)=>{
  if(!url.endsWith('/token'))return json(company);
  if(init.body.get('grant_type')==='authorization_code')return json(tokens('current-access','current-refresh'));
  refreshes++;started.resolve();await gate.promise;return json(tokens('late-access','late-refresh'));
 });
 try{
  await authorize(f);await f.service.verify(f.sa.principal);await expire(f);const old=f.service.verify(f.sa.principal);const handled=old.catch(e=>e);await started.promise;
  await f.service.disconnect(f.sa.principal);await authorize(f);await f.service.verify(f.sa.principal);gate.resolve();assert.equal((await handled).code,'OPERATION_STALE');
  let [row]=await f.db.client`SELECT * FROM erp_connections WHERE organization_id=${f.a.organizationId}`;assert.equal(f.vault.open(row.access_token_encrypted,f.a.organizationId,'access'),'current-access');assert.equal(row.status,'CONNECTED');
  await expire(f);await f.db.client`UPDATE erp_connections SET refresh_lease=gen_random_uuid(),refresh_lease_until=NOW()-interval '1 second' WHERE organization_id=${f.a.organizationId}`;
  await assert.rejects(f.service.verify(f.sa.principal),/REAUTH_REQUIRED/);assert.equal(refreshes,1);assert.equal((await f.service.status(f.sa.principal)).oauthConnected,false);
 }finally{gate.resolve();await f.cleanup();}
});
test('7B.2C read errors 401/403/429/500, malformed JSON, network/timeout and account mismatch',async()=>{
 let scenario='ok',refreshFailure=false;let getCalls=0;
 const f=await fixture(async(url)=>{
  if(url.endsWith('/token')){if(refreshFailure)throw Error('synthetic-secret-in-provider-error');return json(tokens());}
  getCalls++;
  if(scenario==='network')throw Error('synthetic-secret-in-provider-error');
  if(scenario==='timeout')return new Promise(()=>{});
  if(scenario==='malformed')return json({unexpected:true});
  if(scenario==='mismatch')return json({...company,cpfCnpj:'22222222222'});
  if(/^[0-9]+$/.test(scenario))return json({},Number(scenario),scenario==='429'?{'Retry-After':'1'}:{});
  return json(company);
 },50);
 try{
  for(const [scenarioName,error] of [['403','PERMISSION_DENIED'],['500','HTTP_ERROR'],['malformed','CONTRACT_CONFLICT'],['network','NETWORK'],['timeout','TIMEOUT'],['mismatch','ACCOUNT_MISMATCH'],['401','AUTH_FAILED'],['429','RATE_LIMIT']]){
   scenario='ok';await authorize(f);await f.db.client`UPDATE erp_connections SET pause_until=NULL WHERE organization_id=${f.a.organizationId}`;
   scenario=scenarioName;await assert.rejects(f.service.verify(f.sa.principal),e=>e.code===error&&!e.message.includes('synthetic-secret'));
   const status=await f.service.status(f.sa.principal);assert.equal(status.accountVerified,false);
   if(['401','mismatch'].includes(scenarioName))assert.equal(status.oauthConnected,false);else assert.equal(status.oauthConnected,true);
   if(scenarioName==='429'){const before=getCalls;await assert.rejects(f.service.verify(f.sa.principal),/RATE_PAUSED/);assert.equal(getCalls,before);}
  }
  scenario='ok';await f.db.client`UPDATE erp_connections SET pause_until=NULL WHERE organization_id=${f.a.organizationId}`;await authorize(f);await expire(f);refreshFailure=true;
  await assert.rejects(f.service.verify(f.sa.principal),/NETWORK/);assert.equal((await f.service.status(f.sa.principal)).status,'REAUTH_REQUIRED');
  await assert.rejects(f.service.verify(f.sa.principal),/REAUTH_REQUIRED/);
 }finally{await f.cleanup();}
});
test('7B.2D simultaneous callbacks exchange once; logout during exchange blocks persistence',async()=>{
 let calls=0,gate=deferred(),started=deferred();const f=await fixture(async()=>{calls++;started.resolve();await gate.promise;return json(tokens());});
 try{
  let u=new URL(await f.service.start(f.sa.principal)),cb=new URL(f.config.tiny.callback);cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'code'}).toString();
  const first=f.service.callback(f.sa.principal,cb);await started.promise;await assert.rejects(f.service.callback(f.sa.principal,cb),/INVALID_STATE/);assert.equal(calls,1);gate.resolve();await first;
  gate=deferred();started=deferred();u=new URL(await f.service.start(f.sa.principal));cb=new URL(f.config.tiny.callback);cb.search=new URLSearchParams({state:u.searchParams.get('state'),code:'code'}).toString();
  const second=f.service.callback(f.sa.principal,cb).catch(e=>e);await started.promise;await f.auth.logout(f.sa.principal);gate.resolve();assert.equal((await second).code,'OPERATION_STALE');assert.equal((await f.service.status(f.sa.principal)).oauthConnected,false);
 }finally{gate.resolve();await f.cleanup();}
});
test('7B.2D expired or unknown refresh validity blocks renewal without provider request',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return json(tokens());});
 try{
  for(const missing of [false,true]){
   await authorize(f);await expire(f);await f.db.client`UPDATE erp_connections SET refresh_expires_at=${missing?null:new Date(Date.now()-1000)} WHERE organization_id=${f.a.organizationId}`;
   const before=calls;await assert.rejects(f.service.verify(f.sa.principal),/REAUTH_REQUIRED/);assert.equal(calls,before);
  }
 }finally{await f.cleanup();}
});
