import { fail } from '../security/errors.ts';
import { identity } from './pagination.ts';
import type { CatalogMode, Projection, Resource } from './model.ts';
export interface ExactDecimal { original:string;normalized:string;scale:number;normalization:'DECIMAL_LEXEME_V1';rounding:'NONE';validation:'PENDING' }
export function decimal(value:unknown,signed=false):ExactDecimal|null {
  if(value===undefined||value===null)return null;
  // Non-integral Number has already lost the ERP lexeme. Refuse to manufacture precision.
  if(typeof value==='number'){if(!Number.isSafeInteger(value))fail('DECIMAL_LEXEME_REQUIRED');value=String(value);}
  if(typeof value!=='string'||value.length>100)fail('DECIMAL_INVALID');
  const match=/^(-?)(\d{1,80})(?:\.(\d{1,80}))?(?:[eE]([+-]?\d{1,2}))?$/.exec(value);
  if(!match||!signed&&match[1]==='-')fail('DECIMAL_INVALID');
  const exponent=Number(match[4]??0);if(Math.abs(exponent)>18)fail('DECIMAL_SCALE_UNSUPPORTED');
  const digits=match[2]+(match[3]??''),point=match[2].length+exponent;
  let normalized=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
  normalized=normalized.replace(/^0+(?=\d)/,'');if(match[1]&&/[1-9]/.test(digits))normalized='-'+normalized;
  return {original:value,normalized,scale:Math.max(0,digits.length-point),normalization:'DECIMAL_LEXEME_V1',rounding:'NONE',validation:'PENDING'};
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('STRUCTURE_INVALID');return value as Record<string,unknown>;}
function optionalObject(value:unknown):Record<string,unknown>{return value===null||value===undefined?{}:object(value);}
function text(value:unknown,max=512):string|null {if(value===null||value===undefined)return null;if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail('TEXT_INVALID');return value.trim()?value:null;}
function state(value:unknown,contact=false){if(value===null||value===undefined)return 'UNKNOWN';if(typeof value!=='string')fail('STATUS_INVALID');return value==='A'||contact&&value==='B'?'ACTIVE':value==='I'?'INACTIVE':value==='E'?'DELETED':'UNKNOWN';}
function commercial(mode:CatalogMode,status:string,eligible:boolean):Projection['commercial']{return status==='INACTIVE'||status==='DELETED'?'BLOCKED':mode==='FIXTURE'&&eligible?'SYNTHETIC_ONLY':'PENDING';}
export function mapProduct(value:unknown,mode:CatalogMode):Projection {
 const d=object(value),erpId=identity(d.id),name=text(d.descricao),unit=text(d.unidade,32),prices=optionalObject(d.precos),status=state(d.situacao),type=text(d.tipo,16),variation=text(d.tipoVariacao,16);
 if(!name)fail('DESCRIPTION_INVALID');
 const base=decimal(prices.preco),promotion=decimal(prices.precoPromocional);
 return {erpId,code:text(d.sku,120),ean:text(d.gtin,64),name,unitOriginal:unit,conversionRule:null,status,statusOriginal:text(d.situacao,16),typeOriginal:type,variationOriginal:variation,
   commercial:commercial(mode,status,status==='ACTIVE'&&type==='S'&&variation!=='P'&&variation!=='V'&&!!unit&&!!base),
   pricing:{base:base?{...base,kind:'BASE',source:'GET /produtos',listId:null}:null,promotion:promotion?{...promotion,kind:'PROMOTIONAL',source:'GET /produtos',listId:null}:null,effective:null,policy:'PENDING'},
   brand:null,weights:{gross:null,net:null,physicalUnit:'UNKNOWN',grams:null,validation:'PENDING'},boxRule:null,updatedOriginal:text(d.dataAlteracao,80),source:'GET /produtos',
   blockers:mode==='REAL'?['PRICE_POLICY_PENDING','UNIT_POLICY_PENDING','WEIGHT_POLICY_PENDING','PRESENTATION_POLICY_PENDING']:[]};
}
export function mapContact(value:unknown,mode:CatalogMode):Projection {
 const d=object(value),erpId=identity(d.id),name=text(d.nome),address=optionalObject(d.endereco),seller=optionalObject(d.vendedor),status=state(d.situacao,true);
 if(!name)fail('CONTACT_NAME_INVALID');
 const uf=text(address.uf,2);if(uf&&!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(uf))fail('UF_INVALID');
 if(d.tipos!==null&&d.tipos!==undefined&&(!Array.isArray(d.tipos)||d.tipos.length>20))fail('CONTACT_TYPES_INVALID');
 const types=(d.tipos as unknown[]|null|undefined??[]).map(x=>{const t=object(x);return {id:identity(t.id),description:text(t.descricao,120)};});
 const sellerId=d.vendedor===null||d.vendedor===undefined?null:identity(seller.id);
 return {erpId,name,code:text(d.codigo,120),tradeName:text(d.fantasia),city:text(address.municipio,120),state:uf,status,statusOriginal:text(d.situacao,16),types,sellerId,sellerLink:sellerId?'PENDING_REFERENCE':'UNASSIGNED',
  eligibility:mode==='FIXTURE'&&status==='ACTIVE'&&types.some(x=>x.description==='Cliente sintético')?'SYNTHETIC_ONLY':'CLASSIFICATION_PENDING',commercial:commercial(mode,status,false),updatedOriginal:text(d.dataAtualizacao,80),source:'GET /contatos'};
}
export function mapSeller(value:unknown,mode:CatalogMode):Projection {
 const d=object(value),person=object(d.contato),status=state(d.situacao,true),name=text(person.nome);if(!name)fail('SELLER_NAME_INVALID');
 return {erpId:identity(d.id),contactId:identity(person.id),name,status,statusOriginal:text(d.situacao,16),commercial:commercial(mode,status,false),source:'GET /vendedores'};
}
export function mapPriceList(value:unknown,mode:CatalogMode):Projection {
 const d=object(value),name=text(d.descricao);if(!name)fail('PRICE_LIST_NAME_INVALID');
 // Detail cardinality/formula are not commercially homologated; never infer a formula from the name.
 if(d.excecoes!==undefined&&d.excecoes!==null)fail('PRICE_LIST_EXCEPTION_CONTRACT_PENDING');
 return {erpId:identity(d.id),name,adjustment:decimal(d.acrescimoDesconto,true),effectiveFormula:null,status:'UNKNOWN',commercial:mode==='FIXTURE'?'SYNTHETIC_ONLY':'PENDING',source:'GET /listas-precos'};
}
export function mapCatalog(resource:Resource,item:unknown,mode:CatalogMode):Projection {return {products:mapProduct,contacts:mapContact,sellers:mapSeller,priceLists:mapPriceList}[resource](item,mode);}
// Controlled detail enrichment retains the listing values; an absent detail field never erases them.
export function enrichProduct(existing:Projection,value:unknown):Projection {
 const d=object(value);if(d.id!==null&&d.id!==undefined&&identity(d.id)!==existing.erpId)fail('DETAIL_ID_CONFLICT');
 const brand=optionalObject(d.marca),dimensions=optionalObject(d.dimensoes);
 const prior=optionalObject(existing.weights);
 const gross=Object.hasOwn(dimensions,'pesoBruto')?decimal(dimensions.pesoBruto):prior.gross??null,net=Object.hasOwn(dimensions,'pesoLiquido')?decimal(dimensions.pesoLiquido):prior.net??null;
 return {...existing,brand:d.marca===null||d.marca===undefined?existing.brand:{erpId:brand.id===undefined||brand.id===null?null:identity(brand.id),name:text(brand.nome,120)},
  weights:d.dimensoes===null||d.dimensoes===undefined?existing.weights:{gross,net,physicalUnit:'UNKNOWN',grams:null,source:'GET /produtos/{id}',validation:'PENDING'},
  boxRule:d.unidadePorCaixa===undefined?existing.boxRule:{original:text(d.unidadePorCaixa,120),conversion:null,validation:'PENDING'},detailSource:'GET /produtos/{id}'};
}
