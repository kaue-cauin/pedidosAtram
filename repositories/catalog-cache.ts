import type { CatalogManifest } from '../domain/catalog-contract.ts';
export interface CatalogScope { organizationId:string;userId:string;projection:'TECHNICAL_ADMIN'|'SYNTHETIC' }
export type CatalogEntry=Readonly<Record<string,unknown>&{erpId:string;commercial:string}>;
export interface CachedCatalog { scope:CatalogScope;manifest:CatalogManifest;resources:Record<string,CatalogEntry[]>;savedAt:number;expiresAt:number }
export const scopeKey=(s:CatalogScope)=>JSON.stringify([s.organizationId,s.userId,s.projection]);
export interface CatalogCache { readState(scope:CatalogScope):Promise<{active:CachedCatalog|null;prepared:CachedCatalog|null;epoch:number}>;read(scope:CatalogScope):Promise<CachedCatalog|null>;readPrepared(scope:CatalogScope):Promise<CachedCatalog|null>;prepare(value:CachedCatalog,expected:string|null,valid:()=>boolean,epoch?:number):Promise<number>;activate(scope:CatalogScope,version:string,expected:string|null,valid:()=>boolean,epoch?:number):Promise<void>;clear(scope:CatalogScope):Promise<void> }
export class IndexedCatalogCache implements CatalogCache {
 private connection?:Promise<IDBDatabase>;readonly name:string;
 constructor(name='atram-catalog-v1'){this.name=name;}
 private open(){
  if(this.connection)return this.connection;
  this.connection=new Promise<IDBDatabase>((resolve,reject)=>{
   const r=indexedDB.open(this.name,3);let expired=false;
   const timer=setTimeout(()=>{expired=true;reject(new Error('CATALOG_STORAGE_TIMEOUT'));},5000);
   r.onupgradeneeded=event=>{
    if(!r.result.objectStoreNames.contains('versions'))r.result.createObjectStore('versions');
    if(!r.result.objectStoreNames.contains('heads'))r.result.createObjectStore('heads');
    if(!r.result.objectStoreNames.contains('prepared'))r.result.createObjectStore('prepared');
    if(!r.result.objectStoreNames.contains('epochs'))r.result.createObjectStore('epochs');
    if(event.oldVersion===1){const prepared=r.transaction!.objectStore('prepared'),cursor=r.transaction!.objectStore('heads').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){prepared.put(c.value,c.key);c.delete();c.continue();}};}
   };
   r.onerror=()=>{clearTimeout(timer);reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));};r.onblocked=()=>{expired=true;clearTimeout(timer);reject(new Error('CATALOG_STORAGE_BLOCKED'));};
   r.onsuccess=()=>{clearTimeout(timer);if(expired){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.connection=undefined;};resolve(r.result);};
  }).catch(e=>{this.connection=undefined;throw e;});return this.connection;
 }
 async read(scope:CatalogScope){return (await this.readState(scope)).active;}
 async readPrepared(scope:CatalogScope){return (await this.readState(scope)).prepared;}
 async readState(scope:CatalogScope){const db=await this.open(),key=scopeKey(scope);return new Promise<{active:CachedCatalog|null;prepared:CachedCatalog|null;epoch:number}>((resolve,reject)=>{
  const tx=db.transaction(['heads','prepared','versions','epochs'],'readonly'),state:{active:CachedCatalog|null;prepared:CachedCatalog|null;epoch:number}={active:null,prepared:null,epoch:0};
  for(const [store,field] of [['heads','active'],['prepared','prepared']] as const){const pointer=tx.objectStore(store).get(key);pointer.onsuccess=()=>{if(pointer.result){const record=tx.objectStore('versions').get(key+'|'+pointer.result);record.onsuccess=()=>{state[field]=record.result??null;};}};}
  const epoch=tx.objectStore('epochs').get(key);epoch.onsuccess=()=>{state.epoch=epoch.result??0;};
  tx.oncomplete=()=>resolve(state);tx.onabort=()=>reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));
 });}
 async prepare(value:CachedCatalog,expected:string|null,valid:()=>boolean,epoch=0){const db=await this.open(),key=scopeKey(value.scope);return new Promise<number>((resolve,reject)=>{
  const start=performance.now(),tx=db.transaction(['heads','prepared','versions','epochs'],'readwrite');let code='CATALOG_STORAGE_UNAVAILABLE';const heads=tx.objectStore('heads'),versions=tx.objectStore('versions'),r=tx.objectStore('epochs').get(key);
  r.onsuccess=()=>{
   if((r.result??0)!==epoch){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
   const head=heads.get(key);head.onsuccess=()=>{
   if(!valid()){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
   if((head.result??null)!==expected){code='CATALOG_CACHE_CONFLICT';tx.abort();return;}
   const existing=versions.get(key+'|'+value.manifest.version);existing.onsuccess=()=>{
    if(existing.result){code='CATALOG_VERSION_REUSED';tx.abort();return;}
    if(!valid()){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
    const prepared=tx.objectStore('prepared'),previous=prepared.get(key);previous.onsuccess=()=>{if(previous.result&&previous.result!==expected)versions.delete(key+'|'+previous.result);};
    versions.put(value,key+'|'+value.manifest.version);prepared.put(value.manifest.version,key);
   };
  };};tx.oncomplete=()=>resolve(performance.now()-start);tx.onabort=()=>reject(new Error(code));
 });}
 async activate(scope:CatalogScope,version:string,expected:string|null,valid:()=>boolean,epoch=0){
  const db=await this.open(),key=scopeKey(scope);
  return new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['heads','prepared','versions','epochs'],'readwrite');let code='CATALOG_STORAGE_UNAVAILABLE';
   const heads=tx.objectStore('heads'),prepared=tx.objectStore('prepared'),versions=tx.objectStore('versions');
   const epochRecord=tx.objectStore('epochs').get(key);epochRecord.onsuccess=()=>{
    if((epochRecord.result??0)!==epoch){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
    const active=heads.get(key);active.onsuccess=()=>{
    const pending=prepared.get(key);pending.onsuccess=()=>{
     if(!valid()){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
     if((active.result??null)!==expected||pending.result!==version){code='CATALOG_CACHE_CONFLICT';tx.abort();return;}
     const record=versions.get(key+'|'+version);record.onsuccess=()=>{
      if(!record.result){code='CATALOG_CACHE_CONFLICT';tx.abort();return;}
      if(!valid()){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
      heads.put(version,key);prepared.delete(key);
      // Retain the previous active snapshot until the next successful activation.
      const cursor=versions.openCursor(IDBKeyRange.bound(key+'|',key+'|\uffff'));
      cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.key!==key+'|'+version&&c.key!==key+'|'+expected)c.delete();c.continue();}};
     };
    };
   };};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(code));
  });
 }
 async clear(scope:CatalogScope){const db=await this.open(),key=scopeKey(scope);return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['heads','prepared','versions','epochs'],'readwrite');const epochs=tx.objectStore('epochs'),epoch=epochs.get(key);epoch.onsuccess=()=>epochs.put((epoch.result??0)+1,key);tx.objectStore('heads').delete(key);tx.objectStore('prepared').delete(key);tx.objectStore('versions').delete(IDBKeyRange.bound(key+'|',key+'|\uffff'));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));
 });}
 async close(){(await this.connection?.catch(()=>undefined))?.close();this.connection=undefined;}
}
