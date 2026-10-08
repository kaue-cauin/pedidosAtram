import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authFixture} from '../fixtures.mjs';
import {CatalogRepository} from '../../catalog/repository.ts';
import {CatalogEngine} from '../../catalog/engine.ts';
import {mapCatalog} from '../../catalog/mappers.ts';
const options={real:false,fixture:true,pageSize:25,maxPages:100,maxRecords:2000,maxAttempts:3,intervalMs:4000};
const product=(id,extra={})=>({id,sku:'SKU-REPETIDO',gtin:'0001',descricao:'Produto sintético',unidade:'CX',situacao:'A',tipo:'S',precos:{preco:'10.00'},...extra});
const contact=(id,seller)=>({id,nome:'Contato sintético',situacao:'A',tipos:[],vendedor:seller===null?null:{id:seller},endereco:{municipio:'São Paulo',uf:'SP'},cpfCnpj:'NEVER_PERSIST_THIS',email:'NEVER_PERSIST_THIS'});
async function collect(r,p,data){const source={mode:'FIXTURE',read:async(_p,key,offset,limit)=>({status:200,quota:{},data:{itens:data[key].slice(offset,offset+limit),paginacao:{limit,offset,total:data[key].length}}})};const e=new CatalogEngine(r,source,options,mapCatalog),j=await e.start(p);for(let n=0;n<20;n++)if((await e.step(p,j.id)).status==='COMPLETED')return j;assert.fail('not complete');}
test('7B.3C database reference resolution, quarantine, SKU collisions, price anomalies and immutable history',async()=>{
 const f=await authFixture(),p=f.sa.principal,r=new CatalogRepository(f.db);
 try{
  const data={products:[product('1'),product('2'),product('3',{descricao:''}),product('4',{situacao:'I'}),product('5',{precos:null})],contacts:[contact('10',null),contact('11','9'),contact('12','404')],sellers:[{id:'9',contato:{id:'999',nome:'Vendedor sintético'},situacao:'A'}],priceLists:[{id:'20',descricao:'Lista sintética',acrescimoDesconto:'0'}]};
  const j=await collect(r,p,data),[snapshot]=await f.db.client`SELECT * FROM catalog_snapshots WHERE id=${j.snapshot_id}`;
  assert.ok(snapshot.anomalies.includes('QUARANTINE_PRESENT'));await assert.rejects(r.activate(p,j.snapshot_id,null),/ANOMALY_REVIEW_REQUIRED/);await r.activate(p,j.snapshot_id,null,true);
  const products=(await r.page(p,j.snapshot_id,'products',0,100)).items;assert.equal(products.length,4);assert.equal(products.filter(x=>x.code==='SKU-REPETIDO').length,4);assert.equal(products.find(x=>x.erpId==='4').commercial,'BLOCKED');assert.equal(products.find(x=>x.erpId==='5').pricing.base,null);
  const contacts=(await r.page(p,j.snapshot_id,'contacts',0,100)).items;assert.equal(contacts.find(x=>x.erpId==='10').sellerLink,'UNASSIGNED');assert.equal(contacts.find(x=>x.erpId==='11').sellerLink,'RESOLVED');assert.equal(contacts.find(x=>x.erpId==='12').sellerLink,'UNKNOWN_REFERENCE');assert.equal(contacts.find(x=>x.erpId==='12').commercial,'BLOCKED');assert.ok(!JSON.stringify(contacts).includes('NEVER_PERSIST_THIS'));
  const q=await r.quarantine(p,j.snapshot_id);assert.ok(q.some(x=>x.reason==='SELLER_REFERENCE_UNKNOWN'));assert.ok(q.some(x=>x.reason==='DESCRIPTION_INVALID'));
  const before=structuredClone(products[0]);const next=await collect(r,p,{...data,products:[product('1',{precos:{preco:'20.00'}}),product('2'),product('4',{situacao:'E'}),product('5',{precos:null})]});
  const [nextSnapshot]=await f.db.client`SELECT anomalies FROM catalog_snapshots WHERE id=${next.snapshot_id}`;assert.ok(nextSnapshot.anomalies.includes('PRODUCT_COMMERCIAL_FIELDS_CHANGED'));assert.equal((await r.manifest(p)).version,j.snapshot_id);await r.activate(p,next.snapshot_id,j.snapshot_id,true);assert.deepEqual((await r.page(p,j.snapshot_id,'products',0,100)).items[0],before);
 }finally{await f.cleanup();}
});
test('7B.3C explicit bounded enrichment phase persists progress and preserves listing fields',async()=>{
 const f=await authFixture(),p=f.sa.principal,r=new CatalogRepository(f.db);let details=0;
 try{
  const source={mode:'FIXTURE',read:async(_p,key,offset,limit)=>({status:200,quota:{},data:{itens:key==='products'?[product('1')]:[],paginacao:{offset,limit,total:key==='products'?1:0}}}),detail:async(_p,resource,id)=>{details++;assert.equal(resource,'products');assert.equal(id,'1');return {status:200,quota:{},data:{id:'1',marca:{id:'90',nome:'Marca sintética'},dimensoes:{pesoBruto:'1.250',pesoLiquido:null},unidadePorCaixa:'12'}};}};
  const e=new CatalogEngine(r,source,{...options,detail:true},mapCatalog),j=await e.start(p,[{resource:'products',id:'1'}]);
  for(let i=0;i<4;i++)await e.step(p,j.id);assert.equal(details,0);assert.equal(await r.manifest(p),null);await e.step(p,j.id);assert.equal(details,1);assert.equal((await r.job(p,j.id)).checkpoint.enrichment.index,1);await e.step(p,j.id);await r.activate(p,j.snapshot_id,null);
  const item=(await r.page(p,j.snapshot_id,'products',0,25)).items[0];assert.equal(item.pricing.base.original,'10.00');assert.equal(item.unitOriginal,'CX');assert.equal(item.brand.name,'Marca sintética');assert.equal(item.weights.gross.original,'1.250');assert.equal(item.weights.grams,null);assert.equal(item.boxRule.conversion,null);
  await assert.rejects(new CatalogEngine(r,source,options,mapCatalog).start(p,[{resource:'products',id:'1'}]),/DETAIL_DISABLED/);
 }finally{await f.cleanup();}
});
