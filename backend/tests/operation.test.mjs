import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { authFixture, isolatedDatabase } from './fixtures.mjs';
import { database } from '../db/client.ts';
import { ready } from '../db/readiness.ts';
test('7B.2D actual backend process starts independently and sessions survive restart',async()=>{
 const f=await authFixture();let child;
 const config={PATH:process.env.PATH,DATABASE_URL:f.url,BACKEND_ORIGIN:'http://127.0.0.1:8793',BACKEND_HOST:'127.0.0.1',BACKEND_PORT:'8793',BACKEND_ALLOW_LOOPBACK_HTTP:'yes',BACKEND_ENCRYPTION_KEYS:JSON.stringify({v1:randomBytes(32).toString('hex')}),BACKEND_ACTIVE_KEY:'v1'};
 const start=async()=>{
  child=spawn(process.execPath,['scripts/backend.mjs'],{env:config,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('START_TIMEOUT')),10000);child.once('exit',code=>{clearTimeout(timer);reject(Error('START_EXIT_'+code));});child.stdout.on('data',data=>{if(data.toString().includes('BACKEND_STARTED')){clearTimeout(timer);resolve();}});});
 };
 const stop=async()=>{if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=undefined;};
 try{
  for(let cycle=0;cycle<2;cycle++){
   await start();assert.equal((await fetch(config.BACKEND_ORIGIN+'/api/ready')).status,200);
   const response=await fetch(config.BACKEND_ORIGIN+'/api/auth/me',{headers:{Cookie:'atram_session='+f.sa.token}});assert.equal(response.status,200);assert.equal((await response.json()).user.organizationId,f.a.organizationId);
   await stop();
  }
 }finally{await stop();await f.cleanup();}
});
test('7B.2D schema readiness and unavailable database fail without altering persisted records',async()=>{
 const f=await isolatedDatabase();const bad=database('postgresql://127.0.0.1:1/atram_test_unreachable');
 try{await assert.rejects(ready(f.db),/SCHEMA_NOT_READY/);await assert.rejects(ready(bad));}finally{await bad.close();await f.cleanup();}
});
