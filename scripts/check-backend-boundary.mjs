import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const walk=(root)=>readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(root+'/'+e.name):[root+'/'+e.name]);
for(const root of ['app','components','domain','hooks','services','repositories','integrations'])for(const file of walk(root).filter(p=>/\.(ts|tsx)$/.test(p)&&!p.startsWith('integrations/tiny-poc/'))){
  const source=readFileSync(file,'utf8');assert.ok(!/(?:from|import)\s*\(?\s*['"][^'"]*(?:backend\/|postgres|drizzle)/.test(source),'Backend dependency in browser source: '+file);
}
for(const file of walk('out').filter(p=>/\.(js|html|json)$/.test(p))){
 const source=readFileSync(file,'utf8');for(const name of ['TINY_BACKEND_CLIENT_SECRET','BACKEND_ENCRYPTION_KEYS','class TinyService','synthetic-client-secret','access_token_encrypted'])assert.ok(!source.includes(name),'Private backend content in export: '+file);
}
assert.match(readFileSync('next.config.ts','utf8'),/output:\s*'export'/);
console.log('BACKEND_BROWSER_BOUNDARY_PASS');
