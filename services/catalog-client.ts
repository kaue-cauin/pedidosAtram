import { canonical, type CatalogManifest } from '../domain/catalog-contract.ts';
import { createSearch } from '../domain/search.ts';
import { scopeKey, type CachedCatalog, type CatalogCache, type CatalogEntry, type CatalogScope } from '../repositories/catalog-cache.ts';
const resources=['products','contacts','sellers','priceLists'] as const;
export interface CatalogTransport { manifest():Promise<CatalogManifest|null>;page(version:string,resource:string,offset:number,limit:number):Promise<{version:string;resource:string;offset:number;limit:number;items:CatalogEntry[]}> }
const same=(a:CatalogScope,b:CatalogScope)=>scopeKey(a)===scopeKey(b);
export async function checksum(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function privateField(value:unknown,depth=0):boolean {if(depth>12)return true;if(!value||typeof value!=='object')return false;return Object.entries(value).some(([key,child])=>/cpf|cnpj|email|telefone|celular|access.?token|refresh.?token|endereco/i.test(key)||privateField(child,depth+1));}
function entry(value:CatalogEntry){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.erpId!=='string'||!/^\d{1,30}$/.test(value.erpId)||!['PENDING','BLOCKED','SYNTHETIC_ONLY'].includes(value.commercial)||privateField(value))throw new Error('CATALOG_PROJECTION_INVALID');
}
export async function verify(value:CachedCatalog,scope:CatalogScope){
 const m=value.manifest;
 if(!same(value.scope,scope)||m.organizationId!==scope.organizationId||!m.version||m.state!=='ACTIVE'||m.compatibility!=='TECHNICAL_ONLY'||!['FIXTURE','REAL'].includes(m.mode)||m.mode==='REAL'&&m.commercial!=='PENDING'||m.mode==='FIXTURE'&&m.commercial!=='SYNTHETIC_ONLY'||m.mode==='REAL'&&scope.projection!=='TECHNICAL_ADMIN'||!Number.isInteger(m.cache.maxAgeSeconds)||m.cache.maxAgeSeconds<1||m.cache.maxAgeSeconds>3600||m.mode==='REAL'&&m.cache.offlineAllowed)throw new Error('CATALOG_MANIFEST_INVALID');
 if(Object.keys(m.resources).length!==4||Object.keys(value.resources).length!==4||!Number.isFinite(value.savedAt)||value.expiresAt!==Math.min(value.savedAt,Date.parse(m.publishedAt??''))+m.cache.maxAgeSeconds*1000||!m.publishedAt||!Number.isFinite(Date.parse(m.publishedAt)))throw new Error('CATALOG_MANIFEST_INVALID');
 let count=0;
 for(const name of resources){const spec=m.resources[name],list=value.resources[name];if(!spec?.complete||!Number.isSafeInteger(spec.count)||spec.count<0||!Array.isArray(list)||list.length!==spec.count)throw new Error('CATALOG_COVERAGE_INVALID');count+=list.length;if(count>10000)throw new Error('CATALOG_RECORD_LIMIT');list.forEach(entry);if(new Set(list.map(x=>x.erpId)).size!==list.length||await checksum(list)!==spec.checksum)throw new Error('CATALOG_CHECKSUM_INVALID');}
 if(await checksum(m.resources)!==m.checksum)throw new Error('CATALOG_CHECKSUM_INVALID');
}
export interface CatalogTimings { transferMs:number;verificationMs:number;indexMs:number;indexedDbMs:number;activationMs:number;version:string }
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
export class LocalCatalog {
 private scope:CatalogScope;private cache:CatalogCache;private generation=0;private updateId=0;private active?:CachedCatalog;private pending?:{value:CachedCatalog;search:(q:string)=>CatalogEntry[]};private searchIndex:(q:string)=>CatalogEntry[]=()=>[];
 constructor(scope:CatalogScope,cache:CatalogCache){this.scope={...scope};this.cache=cache;}
 get version(){return this.active?.manifest.version??null;}
 get pendingVersion(){return this.pending?.value.manifest.version??null;}
 get stale(){return !this.active||Date.now()>this.active.expiresAt;}
 search(query:string){return this.stale||this.active?.manifest.mode==='REAL'&&typeof navigator!=='undefined'&&navigator.onLine===false?[]:this.searchIndex(query);}
 private index(value:CachedCatalog){return createSearch(value.resources.products,p=>[p.code,p.ean,p.name,p.brand&&typeof p.brand==='object'?(p.brand as Record<string,unknown>).name:p.brand].filter(x=>typeof x==='string').join(' '),p=>[p.code,p.ean].filter(x=>typeof x==='string') as string[]);}
 async recover(offline=false){
  const generation=this.generation,operation=++this.updateId,scope={...this.scope};
  const [value,pending]=await Promise.all([this.cache.read(scope),this.cache.readPrepared(scope)]);
  if(value)await verify(value,scope);if(pending)await verify(pending,scope);
  if(generation!==this.generation||operation!==this.updateId)return false;
  const usable=(v:CachedCatalog|null)=>v&&Date.now()<=v.expiresAt&&(!offline||v.manifest.cache.offlineAllowed);
  if(usable(pending))this.pending={value:freeze(pending!),search:this.index(pending!)};
  if(!usable(value))return false;
  this.active=freeze(value!);this.searchIndex=this.index(value!);return true;
 }
 async update(transport:CatalogTransport){
  try {
  const operation=++this.updateId,generation=this.generation,scope={...this.scope},expected=(await this.cache.read(scope))?.manifest.version??null,start=performance.now(),m=await transport.manifest();
  if(!m)return null;if(m.organizationId!==scope.organizationId)throw new Error('CATALOG_SCOPE_CHANGED');
  const result:Record<string,CatalogEntry[]>={};let received=0;
  for(const resource of resources){const spec=m.resources[resource];if(!spec||!spec.complete||!Number.isSafeInteger(spec.count)||spec.count<0||spec.count>10000)throw new Error('CATALOG_MANIFEST_INVALID');const items:CatalogEntry[]=[];
   for(let offset=0;offset<spec.count;offset+=50){
    if(generation!==this.generation||operation!==this.updateId)throw new Error('CATALOG_SCOPE_CHANGED');
    const page=await transport.page(m.version,resource,offset,50);
    if(page.version!==m.version||page.resource!==resource||page.offset!==offset||page.limit!==50||page.items.length!==Math.min(50,spec.count-offset))throw new Error('CATALOG_PAGE_INVALID');
    received+=page.items.length;if(received>10000)throw new Error('CATALOG_RECORD_LIMIT');items.push(...page.items);
   }result[resource]=items;
  }
  const transferMs=performance.now()-start,savedAt=Date.now(),value={scope,manifest:m,resources:result,savedAt,expiresAt:Math.min(savedAt,Date.parse(m.publishedAt??''))+m.cache.maxAgeSeconds*1000};
  const verificationStart=performance.now();await verify(value,scope);const verificationMs=performance.now()-verificationStart,indexStart=performance.now(),immutable=freeze(structuredClone(value)),search=this.index(immutable),indexMs=performance.now()-indexStart;
  if(generation!==this.generation||operation!==this.updateId)throw new Error('CATALOG_SCOPE_CHANGED');
  // REAL stays in memory only until a local data retention/offline policy is approved.
  const indexedDbMs=m.mode==='FIXTURE'?await this.cache.prepare(immutable,expected,()=>generation===this.generation&&operation===this.updateId):0;
  if(generation!==this.generation||operation!==this.updateId)throw new Error('CATALOG_SCOPE_CHANGED');this.pending={value:immutable,search};
  return {transferMs,verificationMs,indexMs,indexedDbMs,activationMs:0,version:m.version} satisfies CatalogTimings;
  }catch(e){if(e instanceof Error&&/^CATALOG_HTTP_(401|403)$/.test(e.message))await this.logout();throw e;}
 }
 async activate(interaction:{query:string;selection:boolean;editing:boolean}){
  if(!this.pending||interaction.query||interaction.selection||interaction.editing)return false;
  const pending=this.pending,generation=this.generation,expected=this.version,scope={...this.scope};
  if(pending.value.manifest.mode==='FIXTURE')await this.cache.activate(scope,pending.value.manifest.version,expected,()=>generation===this.generation&&this.pending===pending&&!interaction.query&&!interaction.selection&&!interaction.editing);
  if(generation!==this.generation||this.pending!==pending)return false;
  this.active=pending.value;this.searchIndex=pending.search;this.pending=undefined;return true;
 }
 async logout(){this.generation++;this.active=undefined;this.pending=undefined;this.searchIndex=()=>[];await this.cache.clear(this.scope);}
 async switchScope(scope:CatalogScope){await this.logout();this.scope={...scope};}
}
export function backendCatalogTransport(origin:string):CatalogTransport {
 const base=new URL(origin);if(typeof location==='undefined'||base.origin!==location.origin||base.href!==base.origin+'/'||base.protocol!=='https:'&&base.hostname!=='127.0.0.1')throw new Error('CATALOG_ORIGIN_DENIED');
 const get=async(path:string)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(path,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok)throw new Error('CATALOG_HTTP_'+response.status);const reader=response.body?.getReader();if(!reader)throw new Error('CATALOG_BODY_INVALID');let size=0,bytes='';const decoder=new TextDecoder();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw new Error('CATALOG_BODY_LIMIT');bytes+=decoder.decode(part.value,{stream:true});}bytes+=decoder.decode();return JSON.parse(bytes);}catch(e){await reader.cancel().catch(()=>{});throw e;}}finally{clearTimeout(timer);}};
 const paths:Record<string,string>={products:'products',contacts:'customers',sellers:'sellers',priceLists:'price-lists'};
 return {manifest:()=>get('/api/catalog/manifest'),page:(version,resource,offset,limit)=>{if(!Object.hasOwn(paths,resource))throw new Error('CATALOG_RESOURCE_DENIED');return get('/api/catalog/'+paths[resource]+'?'+new URLSearchParams({version,offset:String(offset),limit:String(limit)}));}};
}
