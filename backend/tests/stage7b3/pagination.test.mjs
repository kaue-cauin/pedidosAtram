import {test} from 'node:test';
import assert from 'node:assert/strict';
import {page,losslessJSON,identity} from '../../catalog/pagination.ts';
test('7B.3B lossless JSON, leading zeros and bounded pagination contracts',()=>{
 const parsed=losslessJSON('{"id":9007199254740993,"sku":"00012","price":123.456789012345678901,"exp":1e-8,"quoted":"quote \\\" 12","flag":true}');
 assert.equal(parsed.id,'9007199254740993');assert.equal(parsed.price,'123.456789012345678901');assert.equal(parsed.exp,'1e-8');assert.equal(parsed.sku,'00012');assert.equal(parsed.flag,true);
 assert.equal(identity('00012'),'00012');assert.throws(()=>identity(9007199254740993),/IDENTITY_INVALID/);
 assert.throws(()=>losslessJSON('{"id":01}'));assert.throws(()=>losslessJSON('{"id":1.}'));
 assert.equal(page({itens:[],paginacao:{limit:25,offset:0,total:0}},0,25,1000).complete,true);
 for(const data of [null,{itens:[],paginacao:{limit:25,offset:0,total:1}},{itens:[{id:1},{id:1}],paginacao:{limit:25,offset:0,total:2}},{itens:[{}],paginacao:{limit:25,offset:0,total:1}}])assert.throws(()=>page(data,0,25,1000));
 assert.throws(()=>page({itens:[],paginacao:{limit:25,offset:25,total:25}},25,25,1000,26),/COVERAGE_INCONSISTENT/);
});
