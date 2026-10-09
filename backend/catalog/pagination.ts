import { fail } from '../security/errors.ts';
import { hash } from '../security/crypto.ts';
import { canonical } from '../../domain/catalog-contract.ts';
export function identity(value:unknown):string {
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return String(value);
  if(typeof value==='string'&&/^[0-9]{1,30}$/.test(value)&&/[1-9]/.test(value))return value;
  return fail('IDENTITY_INVALID');
}
export function integer(value:unknown,max=10000):number {
  if(typeof value==='string'&&!/^\d{1,10}$/.test(value))fail('PAGINATION_INVALID');
  if(typeof value!=='string'&&typeof value!=='number')fail('PAGINATION_INVALID');
  const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>max)fail('PAGINATION_INVALID');return n;
}
// Preserve numeric JSON lexemes before IEEE-754 conversion. No token/PII logging.
export function losslessJSON(text:string):unknown {
  let output='',i=0;
  while(i<text.length){
    if(text[i]==='"'){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}output+=text.slice(start,i);continue;}
    const number=/[-0-9]/.test(text[i])?/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i)):null;
    if(number){output+=JSON.stringify(number[0]);i+=number[0].length;}else output+=text[i++];
  }
  return JSON.parse(output);
}
export function page(data:unknown,offset:number,limit:number,maxRecords:number,previousTotal?:number,previousHash?:string){
  if(!data||typeof data!=='object'||Array.isArray(data))fail('PAGE_INVALID');
  const d=data as Record<string,unknown>,p=d.paginacao as Record<string,unknown>;
  if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(d.itens))fail('PAGE_INVALID');
  const total=integer(p.total,maxRecords),reportedOffset=integer(p.offset,maxRecords),reportedLimit=integer(p.limit,1000);
  if(reportedOffset!==offset||reportedLimit!==limit||previousTotal!==undefined&&previousTotal!==total||offset>total||d.itens.length!==Math.min(limit,total-offset))fail('COVERAGE_INCONSISTENT');
  const items=d.itens as unknown[],ids=items.map(x=>{if(!x||typeof x!=='object'||Array.isArray(x))fail('PAGE_INVALID');return identity((x as Record<string,unknown>).id);});
  if(new Set(ids).size!==ids.length)fail('DUPLICATE_ID');
  const checksum=hash(canonical(items));if(items.length&&checksum===previousHash)fail('PAGE_LOOP');
  return {items,ids,total,checksum,next:offset+items.length,complete:offset+items.length===total};
}
