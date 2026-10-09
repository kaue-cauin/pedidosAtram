import type { CatalogManifest } from '../domain/catalog-contract.ts';
export interface CatalogScope { organizationId:string;userId:string;projection:'TECHNICAL_ADMIN'|'SYNTHETIC' }
export type CatalogEntry=Readonly<Record<string,unknown>&{erpId:string;commercial:string}>;
export interface CachedCatalog { scope:CatalogScope;manifest:CatalogManifest;resources:Record<string,CatalogEntry[]>;savedAt:number;expiresAt:number }
export const scopeKey=(s:CatalogScope)=>JSON.stringify([s.organizationId,s.userId,s.projection]);
export interface CatalogCache { read(scope:CatalogScope):Promise<CachedCatalog|null>;readPrepared(scope:CatalogScope):Promise<CachedCatalog|null>;prepare(value:CachedCatalog,expected:string|null,valid:()=>boolean):Promise<number>;activate(scope:CatalogScope,version:string,expected:string|null,valid:()=>boolean):Promise<void>;clear(scope:CatalogScope):Promise<void> }
export class IndexedCatalogCache implements CatalogCache {
 private connection?:Promise<IDBDatabase>;readonly name:string;
 constructor(name='atram-catalog-v1'){this.name=name;}
 private open(){
  if(this.connection)return this.connection;
  this.connection=new Promise<IDBDatabase>((resolve,reject)=>{
   const r=indexedDB.open(this.name,2);let expired=false;
   const timer=setTimeout(()=>{expired=true;reject(new Error('CATALOG_STORAGE_TIMEOUT'));},5000);
   r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('versions'))r.result.createObjectStore('versions');if(!r.result.objectStoreNames.contains('heads'))r.result.createObjectStore('heads');const prepared=r.result.createObjectStore('prepared');const heads=r.transaction!.objectStore('heads');const cursor=heads.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){prepared.put(c.value,c.key);c.delete();c.continue();}};};
   r.onerror=()=>{clearTimeout(timer);reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));};r.onblocked=()=>{expired=true;clearTimeout(timer);reject(new Error('CATALOG_STORAGE_BLOCKED'));};
   r.onsuccess=()=>{clearTimeout(timer);if(expired){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.connection=undefined;};resolve(r.result);};
  }).catch(e=>{this.connection=undefined;throw e;});return this.connection;
 }
 read(scope:CatalogScope){return this.readPointer(scope,'heads');}
 readPrepared(scope:CatalogScope){return this.readPointer(scope,'prepared');}
 private async readPointer(scope:CatalogScope,store:string){const db=await this.open(),key=scopeKey(scope);return new Promise<CachedCatalog|null>((resolve,reject)=>{
  const tx=db.transaction([store,'versions'],'readonly');let value:CachedCatalog|null=null;const head=tx.objectStore(store).get(key);
  head.onsuccess=()=>{if(head.result){const r=tx.objectStore('versions').get(key+'|'+head.result);r.onsuccess=()=>{value=r.result??null;};}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));
 });}
 async prepare(value:CachedCatalog,expected:string|null,valid:()=>boolean){const db=await this.open(),key=scopeKey(value.scope);return new Promise<number>((resolve,reject)=>{
  const start=performance.now(),tx=db.transaction(['heads','prepared','versions'],'readwrite');let code='CATALOG_STORAGE_UNAVAILABLE';const heads=tx.objectStore('heads'),versions=tx.objectStore('versions'),r=heads.get(key);
  r.onsuccess=()=>{
   if(!valid()){code='CATALOG_SCOPE_CHANGED';tx.abort();return;}
   if((r.result??null)!==expected){code='CATALOG_CACHE_CONFLICT';tx.abort();return;}
   if(expected===value.manifest.version){code='CATALOG_VERSION_REUSED';tx.abort();return;}
   const prepared=tx.objectStore('prepared'),previous=prepared.get(key);previous.onsuccess=()=>{if(previous.result&&previous.result!==expected&&previous.result!==value.manifest.version)versions.delete(key+'|'+previous.result);};
   versions.put(value,key+'|'+value.manifest.version);prepared.put(value.manifest.version,key);

  };tx.oncomplete=()=>resolve(performance.now()-start);tx.onabort=()=>reject(new Error(code));
 });}
 async activate(scope:CatalogScope,version:string,expected:string|null,valid:()=>boolean){
  const db=await this.open(),key=scopeKey(scope);
  return new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['heads','prepared','versions'],'readwrite');let code='CATALOG_STORAGE_UNAVAILABLE';
   const heads=tx.objectStore('heads'),prepared=tx.objectStore('prepared'),versions=tx.objectStore('versions');
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
   };tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(code));
  });
 }
 async clear(scope:CatalogScope){const db=await this.open(),key=scopeKey(scope);return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['heads','prepared','versions'],'readwrite');tx.objectStore('heads').delete(key);tx.objectStore('prepared').delete(key);tx.objectStore('versions').delete(IDBKeyRange.bound(key+'|',key+'|\uffff'));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('CATALOG_STORAGE_UNAVAILABLE'));
 });}
 async close(){(await this.connection?.catch(()=>undefined))?.close();this.connection=undefined;}
}
