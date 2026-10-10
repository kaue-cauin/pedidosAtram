import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isolatedDatabase} from '../fixtures.mjs';
import {applyMigrations} from '../../db/migrate.ts';
import {database} from '../../db/client.ts';
import {Vault,hash} from '../../security/crypto.ts';
import {SubmissionProtection} from '../../submissions/protection.ts';
import {RecoveryGate} from '../../submissions/recovery.ts';
import {SubmissionRepository} from '../../submissions/repository.ts';
import {submissionPayload} from '../../../domain/submission.ts';
import {demoOrder} from '../../../domain/mock-data.ts';
export const key=Buffer.alloc(32,17),id=randomUUID;
export async function fixture(){
 const f=await isolatedDatabase();let runtime,dir,role;
 try{
  await applyMigrations(f.db);dir=await mkdtemp(join(tmpdir(),'atram-ledger-'));const gatePath=join(dir,'recovery.json');
  const open={version:1,environmentId:'synthetic-lab',state:'NORMAL',epoch:id(),windowStart:null,windowEnd:null,oldExecutorsStopped:true};
  await writeFile(gatePath,JSON.stringify(open));
  const [org]=await f.db.client`INSERT INTO organizations(name) VALUES ('Synthetic ledger A') RETURNING id`;
  const [orgB]=await f.db.client`INSERT INTO organizations(name) VALUES ('Synthetic ledger B') RETURNING id`;
  async function principal(roleName,orgId=org.id){
   const [u]=await f.db.client`INSERT INTO users(login,password_hash) VALUES (${id()},'synthetic-not-used') RETURNING id`;
   await f.db.client`INSERT INTO organization_memberships(organization_id,user_id,role) VALUES (${orgId},${u.id},${roleName})`;
   const [s]=await f.db.client`INSERT INTO sessions(user_id,organization_id,session_token_hash,csrf_hash,expires_at) VALUES(${u.id},${orgId},${hash(id())},${hash(id())},now()+interval '1 hour') RETURNING id`;
   return {sessionId:s.id,userId:u.id,organizationId:orgId,role:roleName,login:'synthetic'};
  }
  const admin=await principal('ADMIN'),op=await principal('OPERADOR'),op2=await principal('OPERADOR'),seller=await principal('VENDEDOR'),other=await principal('ADMIN',orgB.id);
  role='ledger_'+id().replaceAll('-','');
  await f.db.client.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD 'synthetic-lab-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  await f.db.client.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
  await f.db.client.unsafe(`GRANT EXECUTE ON FUNCTION submission_read(uuid,uuid,uuid),submission_command(uuid,uuid,text,jsonb),submission_denial(uuid,text) TO "${role}"`);
  const url=new URL(f.url);url.username=role;url.password='synthetic-lab-only';runtime=database(url.href);
  const protection=new SubmissionProtection(new Vault(new Map([['lab-v1',key]]),'lab-v1')),gate=new RecoveryGate(gatePath,'synthetic-lab');
  const repo=new SubmissionRepository(runtime,protection,gate);
  const admitInput=(orderId,origin,extra={})=>{const bytes=submissionPayload({...demoOrder,orderId:origin});return {commandId:id(),orderId,submissionId:id(),expectedOrderRevision:0,sourceLocalRevision:7,canonicalVersion:'legacy-order-canonical-v1',bytes,businessHash:hash(bytes),...extra};};
  async function prepared(){const origin=id(),r=await repo.register(op,id(),origin),input=admitInput(r.projection.orderId,origin);return {origin,orderId:r.projection.orderId,input};}
  async function admitted(){const a=await prepared(),r=await repo.admit(op,a.input);return {...a,result:r};}
  const decision=(a,revision=1)=>({commandId:id(),orderId:a.orderId,submissionId:a.input.submissionId,expectedLedgerRevision:revision});
  async function intended(){const a=await admitted(),d=decision(a),intent=await repo.confirm(op,d);return {...a,intent,confirm:d};}
  function proof(a,kind='ACCEPTED',extra={}){const s=a.intent.projection.submission;return {evidenceId:id(),operationId:a.intent.commandReceipt.operationId,executionId:a.intent.commandReceipt.executionId,source:'LAB_ATTESTATION',businessHash:s.businessHash,requestHash:s.requestHash,account:s.account,generation:s.generation,kind,details:'Synthetic attestation; no external execution',...(kind==='ACCEPTED'?{externalId:'synthetic-'+id()}:{transportNotInvoked:true,executionFenced:true,rejectsPastAndFuture:true,contentRejected:true}),...extra};}
  return {...f,admin,op,op2,seller,other,principal,repo,runtime,runtimeUrl:url.href,gate,gatePath,open,protection,prepared,admitted,intended,admitInput,decision,proof,
   cleanup:async()=>{await runtime.close();await f.db.client.unsafe(`DROP OWNED BY "${role}"`);await f.db.client.unsafe(`DROP ROLE "${role}"`);await f.cleanup();await rm(dir,{recursive:true,force:true});}};
 }catch(error){if(runtime)await runtime.close();if(role){await f.db.client.unsafe(`DROP OWNED BY "${role}"`).catch(()=>{});await f.db.client.unsafe(`DROP ROLE "${role}"`).catch(()=>{});}await f.cleanup();if(dir)await rm(dir,{recursive:true,force:true});throw error;}
}
