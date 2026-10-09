import { products } from '../domain/mock-data.ts';
import type { CatalogManifest } from '../domain/catalog-contract.ts';
import type { CatalogEntry } from '../repositories/catalog-cache.ts';
import { checksum, type CatalogTransport } from './catalog-client.ts';
export const syntheticCatalogScope={organizationId:'00000000-0000-4000-8000-000000000073',userId:'00000000-0000-4000-8000-000000000074',projection:'SYNTHETIC'} as const;
export async function syntheticCatalogTransport(delay=0):Promise<CatalogTransport>{
 const version=crypto.randomUUID(),resources:Record<string,CatalogEntry[]>={products:products.map((p,i)=>({erpId:String(i+1),code:p.code,ean:p.ean,name:p.name,brand:p.brand,unitOriginal:p.unit,status:p.status,fixturePriceCents:p.priceCents,commercial:p.status==='ACTIVE'?'SYNTHETIC_ONLY':'BLOCKED'})),contacts:[],sellers:[],priceLists:[]},spec:CatalogManifest['resources']={};
 for(const [resource,list]of Object.entries(resources))spec[resource]={count:list.length,complete:true,checksum:await checksum(list)};
 const now=new Date().toISOString(),manifest:CatalogManifest={version,organizationId:syntheticCatalogScope.organizationId,mode:'FIXTURE',state:'ACTIVE',commercial:'SYNTHETIC_ONLY',createdAt:now,publishedAt:now,resources:spec,checksum:await checksum(spec),cache:{maxAgeSeconds:3600,offlineAllowed:true},compatibility:'TECHNICAL_ONLY'};
 return {manifest:async()=>manifest,page:async(v,resource,offset,limit)=>{if(delay)await new Promise(r=>setTimeout(r,delay));return {version:v,resource,offset,limit,items:structuredClone(resources[resource].slice(offset,offset+limit))};}};
}
