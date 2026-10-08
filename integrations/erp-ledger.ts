import { ERPFailure, type ERPReceipt, type ERPRejection } from './ERPProvider.ts';
export interface ERPLedger {
 find(id:string):Promise<ERPReceipt|null>;
 findRejection(id:string):Promise<ERPRejection|null>;
 create(receipt:ERPReceipt):Promise<ERPReceipt>;
 reject(rejection:ERPRejection):Promise<ERPReceipt|ERPRejection>;
}
export function sameReceipt(existing:ERPReceipt,incoming:ERPReceipt):ERPReceipt {
 if(existing.submissionId!==incoming.submissionId || existing.orderId!==incoming.orderId || existing.payload!==incoming.payload) throw new ERPFailure('Conflito de identidade ou conteúdo no ERP. Consulte o resultado.','unknown');
 return existing;
}
function rejectFailure(old:ERPRejection,incoming:ERPReceipt|ERPRejection):never {
 if(old.submissionId!==incoming.submissionId || old.orderId!==incoming.orderId || old.payload!==incoming.payload) throw new ERPFailure('Conflito com tentativa rejeitada.','unknown');
 throw new ERPFailure('HTTP 400: condição de pagamento rejeitada. Corrija o pedido e revise novamente.','rejected',0,'validation');
}
export class MemoryERPLedger implements ERPLedger {
 readonly rows=new Map<string,ERPReceipt>(); readonly rejections=new Map<string,ERPRejection>(); creations=0;
 async find(id:string){return this.rows.get(id)??null;} async findRejection(id:string){return this.rejections.get(id)??null;}
 async create(receipt:ERPReceipt){const rejected=this.rejections.get(receipt.submissionId);if(rejected)rejectFailure(rejected,receipt);const old=this.rows.get(receipt.submissionId)??[...this.rows.values()].find(r=>r.orderId===receipt.orderId);if(old)return sameReceipt(old,receipt);this.rows.set(receipt.submissionId,structuredClone(receipt));this.creations++;return receipt;}
 async reject(rejection:ERPRejection){const old=this.rows.get(rejection.submissionId)??[...this.rows.values()].find(r=>r.orderId===rejection.orderId);if(old)return sameReceipt(old,{...rejection,erpOrderId:old.erpOrderId});const rejected=this.rejections.get(rejection.submissionId);if(rejected){if(JSON.stringify({...rejected,rejectedAt:''})!==JSON.stringify({...rejection,rejectedAt:''}))throw new ERPFailure('Conflito de rejeição.','unknown');return rejected;}this.rejections.set(rejection.submissionId,structuredClone(rejection));return rejection;}
}
export class IndexedDBERPLedger implements ERPLedger {
 private connection?:Promise<IDBDatabase>; private name:string;
 constructor(name='atram-mock-erp-v1'){this.name=name;}
 async close(){(await this.connection?.catch(()=>undefined))?.close();this.connection=undefined;}
 private open(){
  this.connection??=new Promise<IDBDatabase>((resolve,reject)=>{
   const req=indexedDB.open(this.name,2);let expired=false;
   const timer=setTimeout(()=>{expired=true;reject(new Error('Mock ERP indisponível.'));},5000);
   req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('receipts')){const s=db.createObjectStore('receipts',{keyPath:'submissionId'});s.createIndex('orderId','orderId',{unique:true});}if(!db.objectStoreNames.contains('rejections'))db.createObjectStore('rejections',{keyPath:'submissionId'});};
   req.onerror=()=>{clearTimeout(timer);reject(req.error);};req.onblocked=()=>{clearTimeout(timer);expired=true;reject(new Error('Mock ERP bloqueado por outra aba.'));};
   req.onsuccess=()=>{clearTimeout(timer);if(expired){req.result.close();return;}req.result.onversionchange=()=>{req.result.close();this.connection=undefined;};resolve(req.result);};
  }).catch(e=>{this.connection=undefined;throw e;});return this.connection;
 }
 private async read<T>(store:string,id:string){const db=await this.open();return new Promise<T|null>((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).get(id);tx.oncomplete=()=>resolve(req.result??null);tx.onabort=()=>reject(tx.error??new Error('Consulta ao Mock ERP falhou.'));});}
 find(id:string){return this.read<ERPReceipt>('receipts',id);}findRejection(id:string){return this.read<ERPRejection>('rejections',id);}
 private async mutate(incoming:ERPReceipt|ERPRejection,create:boolean){
  const db=await this.open();return new Promise<ERPReceipt|ERPRejection>((resolve,reject)=>{
   let tx:IDBTransaction;try{tx=db.transaction(['receipts','rejections'],'readwrite',{durability:'strict'});}catch{tx=db.transaction(['receipts','rejections'],'readwrite');}
   const receipts=tx.objectStore('receipts'),rejections=tx.objectStore('rejections');let result:ERPReceipt|ERPRejection=incoming;let error:unknown;
   const abort=(e:unknown)=>{error=e;tx.abort();};
   const check=receipts.index('orderId').get(incoming.orderId);
   check.onsuccess=()=>{try{
    if(check.result){result=sameReceipt(check.result,{...incoming,erpOrderId:'erpOrderId' in incoming?incoming.erpOrderId:check.result.erpOrderId});return;}
    const byKey=receipts.get(incoming.submissionId);
    byKey.onsuccess=()=>{try{
     if(byKey.result){result=sameReceipt(byKey.result,{...incoming,erpOrderId:'erpOrderId' in incoming?incoming.erpOrderId:byKey.result.erpOrderId});return;}
     const rejected=rejections.get(incoming.submissionId);
     rejected.onsuccess=()=>{try{
      if(rejected.result){if(create)rejectFailure(rejected.result,incoming);if(rejected.result.orderId!==incoming.orderId||rejected.result.payload!==incoming.payload)throw new ERPFailure('Conflito de rejeição.','unknown');result=rejected.result;}
      else if(create)receipts.add(incoming);else rejections.add(incoming);
     }catch(e){abort(e);}};
    }catch(e){abort(e);}};
   }catch(e){abort(e);}};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(error??tx.error??new Error('Transação do Mock ERP falhou.'));
  });
 }
 async create(receipt:ERPReceipt){return await this.mutate(receipt,true) as ERPReceipt;}
 reject(rejection:ERPRejection){return this.mutate(rejection,false);}
}
