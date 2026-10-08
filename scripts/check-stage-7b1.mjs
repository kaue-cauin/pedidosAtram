import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { readConfig, TINY_API, TINY_AUTH, TINY_TOKEN } from '../integrations/tiny-poc/config.ts';
import { TinyOAuthSession } from '../integrations/tiny-poc/oauth.ts';
import { TinyReadClient } from '../integrations/tiny-poc/read-client.ts';
import { createPOCServer } from '../integrations/tiny-poc/server.ts';
import { observe } from '../integrations/tiny-poc/contracts.ts';
import { requestJSON, quota } from '../integrations/tiny-poc/transport.ts';
const fixtureConfig = () => ({clientId:'SYNTHETIC_CLIENT',clientSecret:'SYNTHETIC_SECRET',adminKey:'SYNTHETIC_LOCAL_KEY_12345678901234567890',
 redirectUri:'http://127.0.0.1:8787/oauth/callback',accountDocument:'00000000000000',resources:['info','products','contacts','sellers','priceLists','productDetail','priceListDetail'],pkce:'S256',allowRefresh:false,productId:123,priceListId:456});
const tokens = (patch={}) => ({access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',token_type:'Bearer',expires_in:3600,refresh_expires_in:86400,...patch});
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
const page = itens => ({itens,paginacao:{limit:10,offset:0,total:itens.length}});
const info = {razaoSocial:'SYNTHETIC_COMPANY',cpfCnpj:'00.000.000/0000-00',fantasia:'SYNTHETIC_NAME'};
const product = {id:123,sku:'000123',gtin:'0001234567890',descricao:'SYNTHETIC_PRODUCT',unidade:'CX',situacao:'A',tipo:'S',precos:{preco:1.23,precoPromocional:null}};
const kind = expected => error => error?.kind===expected;
async function connected(config=fixtureConfig(), fetcher=async()=>json(tokens()),clock=Date.now) {
 const oauth=new TinyOAuthSession(config,fetcher,clock);const start=oauth.start();const callback=new URL(config.redirectUri);
 callback.search=new URLSearchParams({state:new URL(start.url).searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();
 await oauth.callback(callback,start.cookie);return oauth;
}
test('configuration gates live mode and rejects unsafe callback, missing credentials and resource escalation',()=>{
 assert.throws(()=>readConfig({}),kind('CONFIG_PENDING'));
 const env={TINY_POC_APPROVED:'yes',TINY_POC_ACCOUNT_DOCUMENT:'00000000000000',TINY_POC_PLAN:'SYNTHETIC',TINY_POC_USER:'SYNTHETIC',TINY_POC_CLIENT_ID:'SYNTHETIC',TINY_POC_CLIENT_SECRET:'SYNTHETIC',TINY_POC_ADMIN_KEY:fixtureConfig().adminKey,TINY_POC_REDIRECT_URI:fixtureConfig().redirectUri,TINY_POC_READ_RESOURCES:'info,products',TINY_POC_PKCE_SUPPORT:'confirmed-s256'};
 assert.equal(readConfig(env).pkce,'S256');
 for(const uri of ['http://0.0.0.0:8787/oauth/callback','https://example.com/oauth/callback','http://127.0.0.1:8787/oauth/callback?x=1','http://u:p@127.0.0.1:8787/oauth/callback'])assert.throws(()=>readConfig({...env,TINY_POC_REDIRECT_URI:uri}),kind('CONFIG_INVALID'));
 assert.throws(()=>readConfig({...env,TINY_POC_PKCE_SUPPORT:'pending'}),kind('PKCE_PENDING'));
 assert.throws(()=>readConfig({...env,TINY_POC_READ_RESOURCES:'info,pedidos'}),kind('CONFIG_INVALID'));
 assert.throws(()=>readConfig({...env,TINY_POC_ADMIN_KEY:'short'}),kind('CONFIG_INVALID'));
 assert.throws(()=>readConfig({...env,TINY_POC_READ_RESOURCES:'info,productDetail',TINY_POC_PRODUCT_ID:'123/../../pedidos'}),kind('CONFIG_INVALID'));
});
test('OAuth state, cookie, exact callback, expiry, PKCE S256 and concurrent replay',async()=>{
 let calls=0,now=0;const config=fixtureConfig();const oauth=new TinyOAuthSession(config,async(url,init)=>{
  calls++;assert.equal(url,TINY_TOKEN);assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
  assert.equal(init.body.get('redirect_uri'),config.redirectUri);assert.ok(init.body.get('code_verifier'));return json(tokens());
 },()=>now);
 const start=oauth.start(),auth=new URL(start.url);assert.equal(auth.origin+auth.pathname,TINY_AUTH);
 assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.ok(auth.searchParams.get('code_challenge'));
 assert.equal(auth.searchParams.has('client_secret'),false);const callback=new URL(config.redirectUri);
 callback.search=new URLSearchParams({state:auth.searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();
 const invalid=new URL(callback);invalid.searchParams.set('state','wrong');await assert.rejects(oauth.callback(invalid,start.cookie),kind('INVALID_STATE'));
 await assert.rejects(oauth.callback(callback,'wrong-cookie'),kind('INVALID_STATE'));
 const foreign=new URL(callback);foreign.host='127.0.0.1:9999';await assert.rejects(oauth.callback(foreign,start.cookie),kind('INVALID_STATE'));
 const results=await Promise.allSettled([oauth.callback(callback,start.cookie),oauth.callback(callback,start.cookie)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);
 await assert.rejects(oauth.callback(callback,start.cookie),kind('INVALID_STATE'));
 const later=oauth.start();now=300001;const expired=new URL(config.redirectUri);expired.search=new URLSearchParams({state:new URL(later.url).searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();
 await assert.rejects(oauth.callback(expired,later.cookie),kind('INVALID_STATE'));assert.equal(calls,1);
});
test('OAuth denial consumes state without token exchange and duplicate parameters are rejected',async()=>{
 let calls=0;const config=fixtureConfig();const oauth=new TinyOAuthSession(config,async()=>{calls++;return json(tokens());});
 const a=oauth.start(),u=new URL(config.redirectUri);u.search=new URLSearchParams({state:new URL(a.url).searchParams.get('state'),error:'SYNTHETIC_DENIED',error_description:'PRIVATE_DATA'}).toString();
 await assert.rejects(oauth.callback(u,a.cookie),kind('AUTH_DENIED'));await assert.rejects(oauth.callback(u,a.cookie),kind('INVALID_STATE'));assert.equal(calls,0);
 const b=oauth.start();u.search=new URLSearchParams({state:new URL(b.url).searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();u.searchParams.append('code','duplicate');
 await assert.rejects(oauth.callback(u,b.cookie),kind('INVALID_CALLBACK'));assert.equal(calls,0);
});
test('token response validation rejects malformed/unsafe payloads and permits documented bearer fields',async()=>{
 for(const payload of [null,{},tokens({expires_in:'3600'}),tokens({token_type:'Basic'}),tokens({access_token:'a\r\nb'}),tokens({refresh_token:123}),tokens({expires_in:0}),tokens({refresh_expires_in:0})])await assert.rejects(connected(fixtureConfig(),async()=>json(payload)),kind('INVALID_TOKEN'));
 const oauth=await connected();assert.equal(await oauth.accessToken(),'SYNTHETIC_ACCESS');assert.equal(oauth.connected(),true);
});
test('expiration requires reconnection without refresh authorization',async()=>{
 let now=0;const oauth=await connected(fixtureConfig(),async()=>json(tokens({expires_in:60})),()=>now);now=31000;
 await assert.rejects(oauth.accessToken(),kind('RECONNECT_REQUIRED'));assert.equal(oauth.connected(),false);
});
test('refresh serializes concurrent callers, accepts rotation, uses server POST and no access-token replay',async()=>{
 let now=0,calls=0;const config={...fixtureConfig(),allowRefresh:true};const oauth=await connected(config,async(url,init)=>{
  calls++;if(calls===1)return json(tokens({expires_in:60}));assert.equal(init.body.get('grant_type'),'refresh_token');assert.equal(init.body.get('refresh_token'),'SYNTHETIC_REFRESH');
  return json(tokens({access_token:'SYNTHETIC_ROTATED',refresh_token:'SYNTHETIC_REFRESH_2'}));
 },()=>now);now=31000;const result=await Promise.all([oauth.accessToken(),oauth.accessToken(),oauth.accessToken()]);
 assert.deepEqual(result,['SYNTHETIC_ROTATED','SYNTHETIC_ROTATED','SYNTHETIC_ROTATED']);assert.equal(calls,2);
});
test('disconnect during code exchange cannot resurrect tokens',async()=>{
 let release;const config=fixtureConfig();const oauth=new TinyOAuthSession(config,async()=>new Promise(resolve=>{release=resolve;}));
 const a=oauth.start(),u=new URL(config.redirectUri);u.search=new URLSearchParams({state:new URL(a.url).searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();
 const pending=oauth.callback(u,a.cookie);oauth.disconnect();release(json(tokens()));await assert.rejects(pending,kind('DISCONNECTED'));assert.equal(oauth.connected(),false);
});
test('GET allowlist, account gate, strict first page and eight-call budget',async()=>{
 const config=fixtureConfig(),oauth=await connected(config);const requests=[];
 const client=new TinyReadClient(config,oauth,async(url,init)=>{requests.push({url,method:init.method});assert.equal(init.headers.Authorization,'Bearer SYNTHETIC_ACCESS');return json(url.endsWith('/info')?info:page([product]));});
 await assert.rejects(client.read('products'),kind('ACCOUNT_NOT_VERIFIED'));await assert.rejects(client.read('pedidos'),kind('RESOURCE_DENIED'));assert.equal(requests.length,0);
 assert.equal((await client.read('info')).outcome,'OK');const result=await client.read('products');assert.equal(result.outcome,'OK');assert.deepEqual(result.observation.unitCounts,{UN:0,other:1,missing:0});
 assert.equal(requests[1].url,TINY_API+'/produtos?limit=10&offset=0');assert.ok(requests.every(x=>x.method==='GET'));
 for(let i=0;i<6;i++)await client.read('products');await assert.rejects(client.read('info'),kind('BUDGET_EXHAUSTED'));assert.equal(requests.length,8);
 client.disconnect();assert.equal(client.status().remainingGETs,0);
});
test('wrong account blocks all further resource reads without disclosing the company',async()=>{
 const oauth=await connected();let calls=0;const client=new TinyReadClient(fixtureConfig(),oauth,async()=>{calls++;return json({...info,cpfCnpj:'11111111111111'});});
 assert.equal((await client.read('info')).outcome,'ACCOUNT_MISMATCH');await assert.rejects(client.read('contacts'),kind('ACCOUNT_NOT_VERIFIED'));assert.equal(calls,1);
 assert.equal(JSON.stringify(client.report()).includes('11111111111111'),false);
});
test('observations preserve input text and expose only known field names/counts, not raw values',()=>{
 const raw=structuredClone(product),before=JSON.stringify(raw);const result=observe('products',page([raw]));assert.equal(result.compatible,true);assert.equal(JSON.stringify(raw),before);
 assert.ok(!JSON.stringify(result).includes(raw.gtin));assert.ok(!JSON.stringify(result).includes(raw.sku));
 const conflict=observe('products',page([{...raw,gtin:123,unidade:'PRIVATE_NAME',unexpected:'PRIVATE_DATA'}]));assert.equal(conflict.compatible,false);assert.ok(!JSON.stringify(conflict).includes('PRIVATE'));
 const contact=observe('contacts',page([{id:1,nome:'PRIVATE_PERSON',codigo:'001',situacao:'B',tipos:[],vendedor:{id:2},endereco:{municipio:'PRIVATE_CITY',uf:'SP'},cpfCnpj:'PRIVATE_DOCUMENT'}]));
 assert.equal(contact.compatible,true);assert.ok(!JSON.stringify(contact).includes('PRIVATE'));
 assert.equal(observe('priceLists',page([{id:1,descricao:'PRIVATE_LIST',acrescimoDesconto:null}])).compatible,true);
 assert.equal(observe('sellers',page([{id:1,contato:{id:2,nome:'PRIVATE_SELLER'},situacao:'A'}])).compatible,true);
 assert.throws(()=>observe('contacts',{itens:[],paginacao:{limit:10,offset:10,total:20}}),kind('INCOMPATIBLE_JSON'));
 assert.throws(()=>observe('products',page(Array(11).fill(raw))),kind('INCOMPATIBLE_JSON'));
 assert.equal(observe('priceListDetail',{id:1,excecoes:[]}).compatible,false);
 assert.deepEqual(observe('priceListDetail',{id:1,excecoes:[]}).conflicts,['PRICE_EXCEPTIONS_CARDINALITY']);
 assert.deepEqual(observe('productDetail',{id:1,tipo:'P'}).conflicts,['PRODUCT_TYPE_ALLOF_AMBIGUOUS']);
});
test('HTTP 401/403/429/500 are recorded once, sanitized and never automatically retried',async()=>{
 for(const status of [401,403,429,500]){
  let now=0,calls=0;const config=fixtureConfig(),oauth=await connected(config);const client=new TinyReadClient(config,oauth,async()=>{
   calls++;return calls===1?json(info):json({mensagem:'PRIVATE_SECRET',detalhes:'PRIVATE_DOCUMENT'},status,{'X-RateLimit-Limit':'30','X-RateLimit-Remaining':'0','X-RateLimit-Reset':'5'});
  },()=>now);
  await client.read('info');const result=await client.read('products');assert.equal(result.status,status);assert.equal(calls,2);assert.equal(result.quota.limit,30);
  assert.ok(!JSON.stringify(client.report()).includes('PRIVATE'));assert.equal(client.status().usedGETs,2);
  if(status===401){assert.equal(oauth.connected(),false);await assert.rejects(client.read('products'),kind('RATE_PAUSED'));}
  if(status===429){await assert.rejects(client.read('products'),kind('RATE_PAUSED'));now=6000;await client.read('products');assert.equal(calls,3);}
 }
});
test('malformed response, network and timeout all consume a dispatched GET and have safe metrics',async()=>{
 for(const failure of ['json','network','timeout']){
  let calls=0;const config=fixtureConfig(),oauth=await connected(config);const client=new TinyReadClient(config,oauth,async()=>{
   if(++calls===1)return json(info);
   if(failure==='json')return new Response('PRIVATE_SECRET',{headers:{'Content-Type':'application/json','X-RateLimit-Limit':'30'}});
   if(failure==='network')throw new Error('PRIVATE_SECRET');return new Promise(()=>{});
  },Date.now,15);
  await client.read('info');const result=await client.read('products');assert.equal(client.status().usedGETs,2);assert.equal(calls,2);
  assert.equal(result.outcome,{json:'INVALID_JSON',network:'NETWORK',timeout:'TIMEOUT'}[failure]);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  if(failure==='json'){assert.equal(result.status,200);assert.equal(result.quota.limit,30);}
 }
});
test('transport rejects redirects/body types, bounds bytes and times out a stalled body',async()=>{
 const redirect=await requestJSON(async(_url,init)=>{assert.equal(init.redirect,'error');return json({},302);},'https://example.test',{method:'GET'});assert.equal(redirect.status,302);assert.equal(redirect.data,undefined);
 await assert.rejects(requestJSON(async()=>new Response('private'), 'https://example.test',{method:'GET'}),kind('INVALID_JSON'));
 await assert.rejects(requestJSON(async()=>json({value:'x'.repeat(30)}),'https://example.test',{method:'GET'},100,10),kind('BODY_TOO_LARGE'));
 await assert.rejects(requestJSON(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}),{headers:{'Content-Type':'application/json'}}),'https://example.test',{method:'GET'},15),kind('TIMEOUT'));
});
test('quota accepts only numeric values or a valid HTTP-date, never arbitrary header text',()=>{
 assert.deepEqual(quota(new Headers({'X-RateLimit-Limit':'120','X-RateLimit-Remaining':'0','X-RateLimit-Reset':'5','Retry-After':'12'})),{limit:120,remaining:0,resetSeconds:5,retryAfterSeconds:12});
 const bad=quota(new Headers({'X-RateLimit-Limit':'PRIVATE_SECRET','X-RateLimit-Reset':'-1','Retry-After':'PRIVATE_DATA'}));assert.equal(bad.limit,undefined);assert.equal(bad.resetSeconds,undefined);assert.equal(bad.retryAfterSeconds,undefined);
 assert.equal(quota(new Headers({'Retry-After':'Thu, 08 Oct 2026 12:00:05 GMT'}),Date.parse('2026-10-08T12:00:00Z')).retryAfterSeconds,5);
});
test('local HTTP service enforces authentication, Host, CSRF, cookie binding and no raw DTO/token diagnostics',async()=>{
 const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const config={...fixtureConfig(),redirectUri:`http://127.0.0.1:${port}/oauth/callback`};let upstreamCalls=0;
 const server=createPOCServer(config,async(url,init)=>{upstreamCalls++;assert.ok(url===TINY_TOKEN||url.startsWith(TINY_API));return json(init.method==='POST'?tokens():info);});
 server.listen(port,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${port}`,authorization='Bearer '+config.adminKey;
 try{
  const denied=await fetch(base+'/report');assert.equal(denied.status,401);assert.equal(upstreamCalls,0);
  const badHost=await new Promise((resolve,reject)=>{const request=httpRequest(base+'/status',{headers:{authorization,Host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);request.end();});
  assert.equal(badHost,400);
  assert.equal((await fetch(base+'/status',{headers:{authorization,'Sec-Fetch-Site':'cross-site'}})).status,200);
  assert.equal((await fetch(base+'/report',{headers:{authorization,'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await fetch(base+'/oauth/start',{headers:{authorization,'Sec-Fetch-Site':'cross-site'},redirect:'manual'})).status,403);
  assert.equal((await fetch(base+'/disconnect',{method:'POST',headers:{authorization,Origin:'https://evil.test'}})).status,403);
  const start=await fetch(base+'/oauth/start',{headers:{authorization},redirect:'manual'});assert.equal(start.status,302);
  assert.ok(start.headers.get('set-cookie').includes('HttpOnly'));assert.equal(start.headers.get('referrer-policy'),'no-referrer');
  const auth=new URL(start.headers.get('location')),callback=new URL(config.redirectUri);callback.search=new URLSearchParams({state:auth.searchParams.get('state'),code:'SYNTHETIC_CODE'}).toString();
  assert.equal((await fetch(callback,{redirect:'manual'})).status,400);assert.equal(upstreamCalls,0);
  const success=await fetch(callback,{headers:{cookie:start.headers.get('set-cookie').split(';')[0]},redirect:'manual'});assert.equal(success.status,303);assert.equal(success.headers.get('location'),'/status');
  assert.equal((await fetch(callback,{headers:{cookie:start.headers.get('set-cookie').split(';')[0]},redirect:'manual'})).status,400);assert.equal(upstreamCalls,1);
  const read=await fetch(base+'/read?resource=info',{method:'POST',headers:{authorization}});assert.equal((await read.json()).outcome,'OK');
  const report=await(await fetch(base+'/report',{headers:{authorization}})).text();for(const secret of ['SYNTHETIC_ACCESS','SYNTHETIC_REFRESH','SYNTHETIC_SECRET','SYNTHETIC_COMPANY','SYNTHETIC_NAME','00.000.000/0000-00'])assert.equal(report.includes(secret),false);
  assert.equal((await fetch(base+'/read?resource=pedidos',{method:'POST',headers:{authorization}})).status,400);
  assert.equal((await fetch(base+'/pedidos',{method:'POST',headers:{authorization}})).status,404);
  await fetch(base+'/disconnect',{method:'POST',headers:{authorization}});assert.equal((await(await fetch(base+'/status',{headers:{authorization}})).json()).connected,false);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('refresh failure, expired refresh and session lifetime require reconnection',async()=>{
 for(const scenario of ['failure','expired-refresh','session-expired']){
  let now=0,calls=0;const config={...fixtureConfig(),allowRefresh:true};const oauth=await connected(config,async()=>{
   calls++;return calls===1?json(tokens({expires_in:60,refresh_expires_in:scenario==='expired-refresh'?1:86400})):json({error_description:'PRIVATE_REFRESH_ERROR'},400);
  },()=>now);now=scenario==='session-expired'?1800001:31000;
  await assert.rejects(oauth.accessToken(),kind(scenario==='session-expired'?'SESSION_EXPIRED':'RECONNECT_REQUIRED'));
  assert.equal(oauth.connected(),false);assert.equal(calls,scenario==='failure'?2:1);assert.equal(JSON.stringify(oauth.report()).includes('PRIVATE'),false);
 }
});
test('no PKCE parameters when support explicitly confirmed unavailable; private fields do not serialize',async()=>{
 const oauth=new TinyOAuthSession({...fixtureConfig(),pkce:'unsupported'},async()=>json(tokens()));
 const a=new URL(oauth.start().url);assert.equal(a.searchParams.has('code_challenge'),false);assert.equal(JSON.stringify(oauth),'{}');
 const client=new TinyReadClient(fixtureConfig(),await connected());assert.equal(JSON.stringify(client),'{}');
});
test('read operations are serialized and disconnect in flight preserves the gate and spent budget',async()=>{
 let release;const config=fixtureConfig(),oauth=await connected(config);const client=new TinyReadClient(config,oauth,async()=>new Promise(resolve=>{release=resolve;}));
 const pending=client.read('info');await new Promise(resolve=>setImmediate(resolve));await assert.rejects(client.read('info'),kind('READ_BUSY'));
 client.disconnect();release(json(info));const result=await pending;assert.equal(result.outcome,'DISCONNECTED');assert.equal(client.status().usedGETs,1);assert.equal(client.status().accountVerified,false);
});

test('native transport never follows a redirect to disclose a bearer token',async()=>{
 let requests=0;const server=createServer((req,res)=>{requests++;res.writeHead(302,{Location:'/leak'});res.end();});
 server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}/redirect`;
 try{await assert.rejects(requestJSON(fetch,url,{method:'GET',headers:{Authorization:'Bearer SYNTHETIC_ACCESS'}}),kind('NETWORK'));assert.equal(requests,1);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
