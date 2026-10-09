import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decimal,mapCatalog,mapProduct,mapContact,mapSeller,mapPriceList,enrichProduct} from '../../catalog/mappers.ts';
const product={id:'123',sku:'0001',gtin:'00012345678',descricao:'Produto técnico',unidade:'CX',situacao:'A',tipo:'S',precos:{preco:'123.456789012345678901',precoPromocional:'1.000'}};
test('7B.3C decimal lexemes remain exact; promotion is not the effective price',()=>{
 const p=mapProduct(product,'REAL');assert.equal(p.pricing.base.normalized,'123.456789012345678901');assert.equal(p.pricing.base.scale,18);assert.equal(p.pricing.effective,null);assert.equal(p.pricing.promotion.original,'1.000');assert.equal(p.commercial,'PENDING');assert.equal(p.unitOriginal,'CX');assert.equal(p.conversionRule,null);assert.equal(p.ean,'00012345678');assert.equal(p.code,'0001');assert.equal(p.weights.gross,null);
 assert.equal(decimal('1.230e2').normalized,'123.0');assert.equal(decimal('1e-8').normalized,'0.00000001');assert.equal(decimal(null),null);assert.equal(decimal('0').normalized,'0');assert.throws(()=>decimal(1.23),/DECIMAL_LEXEME_REQUIRED/);assert.throws(()=>decimal('-1'));assert.throws(()=>decimal('1e99'));
 for(const unit of ['UN','KG','CX','PCT','unidade inesperada'])assert.equal(mapProduct({...product,unidade:unit},'REAL').unitOriginal,unit);
 for(const status of ['I','E'])assert.equal(mapProduct({...product,situacao:status},'REAL').commercial,'BLOCKED');assert.equal(mapProduct({...product,situacao:'NEW'},'REAL').status,'UNKNOWN');
 assert.equal(mapProduct({...product,tipoVariacao:'P'},'FIXTURE').commercial,'PENDING');assert.equal(mapProduct({...product,precos:null},'REAL').pricing.base,null);assert.throws(()=>mapProduct({...product,descricao:''},'REAL'),/DESCRIPTION_INVALID/);
 const detail=enrichProduct(p,{id:'123',dimensoes:{pesoBruto:'1.5',pesoLiquido:null},marca:{id:'9',nome:'Marca'}});assert.equal(detail.weights.gross.original,'1.5');assert.equal(detail.weights.net,null);assert.equal(detail.weights.grams,null);assert.equal(detail.pricing.base.original,p.pricing.base.original);assert.equal(enrichProduct(detail,{}).brand.name,'Marca');assert.throws(()=>enrichProduct(p,{id:'124'}),/DETAIL_ID_CONFLICT/);
});
test('7B.3C contacts are not automatically customers; projections exclude private DTO fields',()=>{
 const contact={id:'01',nome:'Cliente técnico',codigo:'0002',situacao:'A',tipos:[],vendedor:null,cpfCnpj:'synthetic-private-document',email:'synthetic-private-mail',telefone:'synthetic-private-phone',endereco:{municipio:'São Paulo',uf:'SP',endereco:'synthetic-private-street'}};
 const c=mapContact(contact,'REAL');assert.equal(c.sellerLink,'UNASSIGNED');assert.equal(c.eligibility,'CLASSIFICATION_PENDING');assert.equal(c.commercial,'PENDING');assert.ok(!JSON.stringify(c).includes('synthetic-private'));assert.equal(c.erpId,'01');assert.equal(mapContact({...contact,vendedor:{id:'9'}},'REAL').sellerId,'9');
 const s=mapSeller({id:'9',contato:{id:'888',nome:'Vendedor'},situacao:'A'},'REAL');assert.equal(s.erpId,'9');assert.equal(s.contactId,'888');assert.ok(s.erpId!==s.contactId);
 assert.throws(()=>mapContact({...contact,endereco:{uf:'XX'}},'REAL'),/UF_INVALID/);assert.throws(()=>mapContact({...contact,vendedor:{}},'REAL'),/IDENTITY_INVALID/);
 const list=mapPriceList({id:'5',descricao:'Atacado',acrescimoDesconto:'-2.500'},'REAL');assert.equal(list.adjustment.normalized,'-2.500');assert.equal(list.effectiveFormula,null);assert.equal(list.commercial,'PENDING');assert.throws(()=>mapPriceList({id:'5',descricao:'X',excecoes:[]},'REAL'),/CONTRACT_PENDING/);
 assert.equal(mapCatalog('products',product,'REAL').erpId,'123');
});
