import { admin, uuid, type Principal } from '../auth/service.ts';
import type { Config } from '../config/env.ts';
import type { TinyService } from '../integrations/tiny/service.ts';
import { fail } from '../security/errors.ts';
import { CatalogRepository } from './repository.ts';
import { CatalogEngine, type PageSource } from './engine.ts';
import type { DetailRequest, Job } from './model.ts';
import { integer } from './pagination.ts';
import { mapCatalog } from './mappers.ts';
import { products, customers, sellers, priceLists } from '../../domain/mock-data.ts';
const names={products:'products',customers:'contacts',sellers:'sellers','price-lists':'priceLists'} as const;
const summary=(j:Job)=>({id:j.id,snapshotId:j.snapshot_id,mode:j.mode,status:j.status,pages:j.pages_processed,received:j.records_received,validated:j.records_validated,quarantined:j.records_quarantined,attempts:j.attempt_count,retryAfter:j.retry_after,leaseActive:!!j.execution_id,errorCode:j.error_code,createdAt:j.created_at,startedAt:j.started_at,finishedAt:j.finished_at});
// Synthetic source is explicitly injected, never used as a fallback for failed REAL reads.
export function fixtureSource():PageSource {
 const data={products:products.map((p,i)=>({id:String(i+1),sku:p.code,gtin:p.ean,descricao:p.name,unidade:p.unit,situacao:p.status==='ACTIVE'?'A':'I',tipo:'S',precos:{preco:Math.floor(p.priceCents/100)+'.'+String(p.priceCents%100).padStart(2,'0')}})),contacts:customers.map((c,i)=>({id:String(i+10001),codigo:c.code,nome:c.name,situacao:'A',tipos:[{id:'1',descricao:'Cliente sintético'}],vendedor:null,endereco:{municipio:c.city,uf:c.state}})),sellers:sellers.map((s,i)=>({id:String(i+1),contato:{id:String(i+20001),nome:s.name},situacao:'A'})),priceLists:priceLists.map((l,i)=>({id:String(i+1),descricao:l.name,acrescimoDesconto:'0'}))};
 return {mode:'FIXTURE',read:async(_p,r,offset,limit)=>({status:200,quota:{},data:{itens:data[r].slice(offset,offset+limit),paginacao:{offset,limit,total:data[r].length}}})};
}
export class CatalogController {
 readonly repository:CatalogRepository;readonly config:Config;readonly tiny:TinyService;
 constructor(repository:CatalogRepository,config:Config,tiny:TinyService){this.repository=repository;this.config=config;this.tiny=tiny;}
 private engine(mode:unknown){
  if(mode!=='FIXTURE'&&mode!=='REAL')fail('INPUT_INVALID');
  const options=this.config.sync;if(!options)fail('SYNC_DISABLED',403);
  const source:PageSource=mode==='FIXTURE'?fixtureSource():{mode:'REAL',binding:p=>this.tiny.syncBinding(p),read:(p,r,o,l,v)=>this.tiny.readPage(p,r,o,l,v!),detail:(p,r,id,v)=>this.tiny.readDetail(p,r,id,v!)};
  return new CatalogEngine(this.repository,source,options,mapCatalog);
 }
 async manifest(p:Principal){const m=await this.repository.manifest(p);if(m?.mode==='REAL')admin(p);return m;}
 async status(p:Principal){const m=await this.manifest(p);return {version:m?.version??null,mode:m?.mode??null,state:m?.state??'EMPTY',commercial:m?.commercial??'PENDING',publishedAt:m?.publishedAt??null,ageSeconds:m?.publishedAt?Math.max(0,Math.floor((Date.now()-Date.parse(m.publishedAt))/1000)):null,resources:m?.resources??{},operationalRealReady:false};}
 async get(p:Principal,path:string,query:URLSearchParams){
  const allowed=path==='/api/admin/sync/status'?['id']:path==='/api/catalog/quarantine'?['version','offset']:Object.hasOwn(names,path.split('/').at(-1)??'')?['version','offset','limit']:[];
  if([...query.keys()].some(k=>!allowed.includes(k)||query.getAll(k).length!==1))fail('INPUT_INVALID');
  if(path==='/api/catalog/manifest')return this.manifest(p);
  if(path==='/api/catalog/status')return this.status(p);
  if(path==='/api/admin/sync/jobs')return this.repository.jobs(p);
  if(path==='/api/admin/sync/status')return summary(await this.repository.job(p,query.get('id')??''));
  if(path==='/api/catalog/quarantine')return this.repository.quarantine(p,query.get('version')??'',integer(query.get('offset')??'0'));
  const name=path.split('/').at(-1) as keyof typeof names;
  if(!Object.hasOwn(names,name)||path!=='/api/catalog/'+name)fail('NOT_FOUND',404);
  return this.repository.page(p,query.get('version')??'',names[name],integer(query.get('offset')??'0'),integer(query.get('limit')??'50',100));
 }
 async post(p:Principal,path:string,data:Record<string,unknown>){
  admin(p);
  if(path==='/api/admin/sync/start'){
    let details:DetailRequest[]=[];
    if(data.details!==undefined){if(!Array.isArray(data.details)||data.details.length>10)fail('INPUT_INVALID');details=data.details.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['resource','id'].includes(k)))fail('INPUT_INVALID');const d=value as DetailRequest;if(!['products','priceLists'].includes(d.resource)||typeof d.id!=='string')fail('INPUT_INVALID');return d;});}
    return summary(await this.engine(data.mode).start(p,details));
  }
  if(path==='/api/admin/catalog/activate'||path==='/api/admin/catalog/rollback'){
    if(typeof data.version!=='string'||!(data.expectedVersion===null||uuid(data.expectedVersion))||data.acknowledge!==undefined&&typeof data.acknowledge!=='boolean')fail('INPUT_INVALID');
    return this.repository.activate(p,data.version,data.expectedVersion,data.acknowledge===true,path.endsWith('/rollback'));
  }
  if(!uuid(data.id))fail('INPUT_INVALID');const j=await this.repository.job(p,data.id),e=this.engine(j.mode);
  if(path==='/api/admin/sync/cancel'){await e.cancel(p,j.id);return {cancelled:true};}
  if(path==='/api/admin/sync/resume')return summary(await e.resume(p,j.id));
  if(path==='/api/admin/sync/step')return e.step(p,j.id);
  fail('NOT_FOUND',404);
 }
}
