import './no-network.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {fixture,id,key} from './fixtures.mjs';
import {database} from '../../db/client.ts';
import {SubmissionRepository} from '../../submissions/repository.ts';
import {SubmissionProtection} from '../../submissions/protection.ts';
import {Vault,hash} from '../../security/crypto.ts';
import {submissionPayload} from '../../../domain/submission.ts';
import {demoOrder} from '../../../domain/mock-data.ts';
import {validateBytes} from '../../submissions/contracts.ts';
import {MATRIX,permitsEdge} from '../../submissions/policy.ts';
import {applyMigrations} from '../../db/migrate.ts';
import {isolatedDatabase} from '../fixtures.mjs';
import {rotateSubmission} from '../../submissions/maintenance.ts';
const withFixture=(name,fn)=>test(name,async()=>{const f=await fixture();try{await fn(f);}finally{await f.cleanup();}});
const reject=(p,code)=>assert.rejects(p,e=>e.code===code);
async function worker(f,config){
 const child=fork(new URL('./worker.mjs',import.meta.url),[],{env:{...process.env,LEDGER_WORKER_CONFIG:JSON.stringify({url:f.runtimeUrl,gatePath:f.gatePath,...config})},stdio:['ignore','ignore','inherit','ipc']});
 await once(child,'message');return {child,run:async()=>{const message=once(child,'message');child.send('start');const [r]=await message;await once(child,'exit');return r;}};
}
withFixture('B01 repeated origin, lost response and stable ownership',async f=>{
 const cmd=id(),origin=id(),a=await f.repo.register(f.op,cmd,origin),b=await f.repo.register(f.op,cmd,origin),c=await f.repo.register(f.op,id(),origin);
 assert.equal(a.projection.orderId,b.projection.orderId);assert.equal(a.projection.orderId,c.projection.orderId);assert.equal(b.replay,true);assert.equal(b.projection.orderRevision,0);
 await reject(f.repo.register(f.op2,id(),origin),'RESOURCE_UNAVAILABLE');
 assert.equal((await f.db.client`SELECT count(*)::int n FROM submission_orders`)[0].n,1);
});
withFixture('B02 100 concurrent identical admissions, restricted runtime connections',async f=>{
 const a=await f.prepared();const results=await Promise.all(Array.from({length:100},()=>f.repo.admit(f.op,a.input)));
 assert.equal(results.filter(r=>!r.replay).length,1);assert.equal(results[99].projection.submission.ledgerRevision,1);
 assert.equal((await f.db.client`SELECT count(*)::int n FROM order_submissions`)[0].n,1);
 assert.equal((await f.db.client`SELECT count(*)::int n FROM submission_events WHERE action='ADMIT'`)[0].n,1);
});
withFixture('B03 independent processes compete; unassigned second operator denied',async f=>{
 const a=await f.prepared(),inputs=[a.input,{...a.input,commandId:id(),submissionId:id()}];
 const workers=await Promise.all(inputs.map(input=>worker(f,{action:'admit',principal:f.op,input})));
 const results=await Promise.all(workers.map(w=>w.run()));assert.equal(results.filter(r=>r.value).length,1);assert.equal(results.find(r=>r.error).error,'ORDER_OCCUPIED');
 await reject(f.repo.admit(f.op2,{...a.input,commandId:id(),submissionId:id()}),'RESOURCE_UNAVAILABLE');
 // Wider two-operator sharing is not inferred: transfer explicitly, then both dispute existing occupancy.
 await f.repo.owner(f.admin,{commandId:id(),orderId:a.orderId,ownerId:f.op2.userId,expectedAnchorRevision:2,reason:'Synthetic explicit transfer'});
 await reject(f.repo.admit(f.op2,{...a.input,commandId:id(),submissionId:id()}),'ORDER_OCCUPIED');
});
withFixture('B04 command reuse across body, resource, action and actor conflicts',async f=>{
 const a=await f.admitted();await reject(f.repo.admit(f.op,{...a.input,sourceLocalRevision:8}),'COMMAND_CONFLICT');
 await reject(f.repo.confirm(f.op,{...f.decision(a),commandId:a.input.commandId}),'COMMAND_CONFLICT');
 const b=await f.prepared();await reject(f.repo.admit(f.op,{...b.input,commandId:a.input.commandId}),'COMMAND_CONFLICT');
 await f.repo.owner(f.admin,{commandId:id(),orderId:a.orderId,ownerId:f.op2.userId,expectedAnchorRevision:2,reason:'Transfer fixture'});
 await reject(f.repo.admit(f.op2,a.input),'COMMAND_CONFLICT');
});
withFixture('B05 original replay after revision advances; new stale command rejected',async f=>{
 const a=await f.intended();const before=await f.repo.read(f.op,a.orderId);
 const r=await f.repo.confirm(f.op,a.confirm);assert.equal(r.replay,true);assert.equal(r.commandReceipt.operationId,a.intent.commandReceipt.operationId);
 await reject(f.repo.confirm(f.op,{...a.confirm,commandId:id()}),'REVISION_CONFLICT');
 assert.equal((await f.repo.read(f.op,a.orderId)).events.length,before.events.length);
});
withFixture('B06 all 49 edges and persistent preparation/terminal restrictions',async f=>{
 const states=['DRAFT','VALIDATING','READY','SUBMITTING','SUBMITTED','ERROR','UNKNOWN'];
 const allowed=['DRAFT:DRAFT','DRAFT:VALIDATING','VALIDATING:DRAFT','VALIDATING:VALIDATING','VALIDATING:READY','READY:READY','READY:SUBMITTING','READY:ERROR','SUBMITTING:SUBMITTING','SUBMITTING:SUBMITTED','SUBMITTING:ERROR','SUBMITTING:UNKNOWN','SUBMITTED:SUBMITTED','ERROR:DRAFT','ERROR:SUBMITTING','ERROR:SUBMITTED','ERROR:ERROR','ERROR:UNKNOWN','UNKNOWN:SUBMITTED','UNKNOWN:ERROR','UNKNOWN:UNKNOWN'];
 let n=0;for(const from of states)for(const to of states){assert.equal(permitsEdge(from,to),allowed.includes(from+':'+to));n++;}assert.equal(n,49);assert.equal(Object.keys(MATRIX).length,7);
 const a=await f.admitted();await reject(f.repo.archive(f.admin,{...f.decision(a),expectedOrderRevision:1}),'OUTCOME_BLOCKED');
 for(const state of ['DRAFT','VALIDATING'])await assert.rejects(f.db.client`UPDATE order_submissions SET state=${state} WHERE submission_id=${a.input.submissionId}`,/STATE_FORBIDDEN|check constraint/);
 await assert.rejects(f.db.client`UPDATE order_submissions SET state='SUBMITTED' WHERE submission_id=${a.input.submissionId}`,/STATE_FORBIDDEN|check constraint/);
 await assert.rejects(f.db.client.begin(async sql=>{await sql`UPDATE order_submissions SET state='ERROR' WHERE submission_id=${a.input.submissionId}`}),/EVIDENCE_INVALID/);
 const blocked=await f.repo.blockBeforeIntent(f.admin,{...f.decision(a),evidenceId:id(),details:'Synthetic pre-dispatch block'});assert.equal(blocked.projection.submission.state,'ERROR');
 assert.equal((await f.repo.confirm(f.op,f.decision(a,2))).projection.submission.state,'SUBMITTING');
});
withFixture('B07 abandonment, expired lease and finishedAt never permit second intent',async f=>{
 const a=await f.intended();await f.db.client`UPDATE submission_communications SET lease_until=now()-interval '1 hour' WHERE submission_id=${a.input.submissionId}`;
 await f.repo.abandon(f.admin,f.decision(a,2));
 for(let i=0;i<5;i++)await reject(f.repo.confirm(f.op,f.decision(a,3)),'OUTCOME_BLOCKED');
 const [c]=await f.db.client`SELECT * FROM submission_communications WHERE submission_id=${a.input.submissionId}`;assert.equal(c.potential_effect,true);assert.equal(c.abandoned,true);assert.ok(c.finished_at);assert.equal(c.safe_closed_at,null);
});
withFixture('B08 restricted SQL cannot mutate bytes, binding, origin, receipt or history',async f=>{
 const a=await f.intended(),proof=f.proof(a);await f.repo.recordLabEvidence(f.admin,f.decision(a,2),proof);
 const before=await f.repo.read(f.op,a.orderId);
 for(const statement of ["UPDATE order_submissions SET snapshot_encrypted='bad'", "UPDATE order_submissions SET target_account='other'", "UPDATE submission_orders SET origin_local_order_id='forged'", "UPDATE order_submissions SET external_order_id='forged'",'DELETE FROM submission_events','TRUNCATE submission_evidence','SELECT * FROM order_submissions'])await assert.rejects(f.runtime.client.unsafe(statement),{code:'42501'});
 await assert.rejects(f.db.client`UPDATE order_submissions SET business_hash=${'0'.repeat(64)}`,/IMMUTABLE_SNAPSHOT/);
 assert.equal((await f.repo.read(f.op,a.orderId)).snapshot,before.snapshot);
 const p=before.projection.submission,context={organizationId:f.op.organizationId,orderId:a.orderId,submissionId:a.input.submissionId,kind:'snapshot',digest:p.businessHash};
 assert.equal(f.protection.open(before.snapshot,context),a.input.bytes);
 assert.throws(()=>f.protection.open(before.snapshot,{...context,organizationId:f.other.organizationId}));
 assert.ok(!before.snapshot.includes('Granola'));
 const next=new SubmissionProtection(new Vault(new Map([['lab-v2',Buffer.alloc(32,23)],['lab-v1',key]]),'lab-v2'));
 const rotated=f.protection.rotate(before.snapshot,context,next);assert.equal(next.open(rotated,context),a.input.bytes);assert.equal(hash(next.open(rotated,context)),p.businessHash);
 await assert.rejects(f.runtime.client`SELECT submission_rotate(${f.admin.sessionId}::uuid,${a.orderId}::uuid,${a.input.submissionId}::uuid,NULL,${before.snapshot},${rotated},NULL,NULL)`,{code:'42501'});
 await rotateSubmission(f.db,f.admin,a.orderId,a.input.submissionId,f.protection,next);
 const after=await f.repo.read(f.op,a.orderId);assert.equal(after.projection.submission.businessHash,p.businessHash);assert.equal(after.projection.submission.ledgerRevision,p.ledgerRevision);assert.equal(next.open(after.snapshot,context),a.input.bytes);
 assert.notEqual(after.snapshot,before.snapshot);assert.notEqual(after.evidence[0].envelope,before.evidence[0].envelope);
 assert.throws(()=>f.protection.open(after.snapshot,context));
});
withFixture('B09 six canonical vectors, order, Unicode and invalid schemas',async f=>{
 const v1={items:[{productId:'p-1',quantity:1}],notes:'ação',orderId:'o-1'},v2={notes:'ação',orderId:'o-1',items:v1.items,status:'UNKNOWN',submissionId:'s-1',submission:{payload:'ignored'},submissionHistory:[],submissionEvents:[]};
 const vectors=[[v1,77,'717c5a8b9c62219481aa56487bde85c6b5dc2d08d8ccb45c948f7ccbc8484b74'],[v2,77,'717c5a8b9c62219481aa56487bde85c6b5dc2d08d8ccb45c948f7ccbc8484b74'],[{...v1,items:[{productId:'p-1',quantity:2}]},77,'1397986323d03313dc61d49c3e522d5c14d32d4531d00407fabb1a25d387b599'],[{items:[],notes:'é',orderId:'o-1'},41,'f338760ebf241e0e8661919f7ab176675a1f710cc71e5d77fc8e4eddceb2b228'],[{items:[],notes:'e\u0301',orderId:'o-1'},42,'d0c7498df8b44e32ef1ee7d3827dd601612c0e1db63bd9f27ed7003f01e58b67'],[demoOrder,3025,'21bef1a4ecbeb24f23b348fc2ef8e2c98edff14b081cf4ece389ba2ce0e16d55']];
 vectors.forEach(([o,n,h])=>{const bytes=submissionPayload(o);assert.equal(Buffer.byteLength(bytes),n);assert.equal(hash(bytes),h);});
 assert.notEqual(submissionPayload({...demoOrder,items:[...demoOrder.items].reverse()}),submissionPayload(demoOrder));
 const a=await f.prepared();for(const invalid of [{...demoOrder,unexpected:true},{...demoOrder,items:[{...demoOrder.items[0],unitPriceCents:Number.MAX_SAFE_INTEGER+1}]},{...demoOrder,items:[{...demoOrder.items[0],quantity:NaN}]}]){const bytes=submissionPayload({...invalid,orderId:a.origin});await reject(f.repo.admit(f.op,{...a.input,bytes,businessHash:hash(bytes)}),'INPUT_INVALID');}
 assert.throws(()=>validateBytes(submissionPayload(v1),hash(submissionPayload(v1))));
});
withFixture('B10 local revision has no authority and divergent content cannot overwrite',async f=>{
 const a=await f.admitted(),bytes=submissionPayload({...JSON.parse(a.input.bytes),notes:'different synthetic content'});
 await reject(f.repo.admit(f.op,{...a.input,commandId:id(),bytes,businessHash:hash(bytes)}),'IDENTITY_CONFLICT');
 const b=await f.prepared();await reject(f.repo.admit(f.op,{...b.input,expectedOrderRevision:1}),'REVISION_CONFLICT');
});
withFixture('B11 tenant isolation, composite foreign keys and scoped evidence',async f=>{
 const a=await f.intended();await reject(f.repo.read(f.other,a.orderId),'RESOURCE_UNAVAILABLE');await reject(f.repo.recordLabEvidence(f.other,f.decision(a,2),f.proof(a)),'RESOURCE_UNAVAILABLE');
 await assert.rejects(f.db.client`INSERT INTO submission_orders(organization_id,origin_local_order_id,owner_id) VALUES(${f.other.organizationId},${id()},${f.op.userId})`,{code:'23503'});
 const opB=await f.principal('OPERADOR',f.other.organizationId),b=await f.repo.register(opB,id(),id());
 await assert.rejects(f.db.client.begin(async sql=>{await sql`UPDATE submission_orders SET current_submission_id=${a.input.submissionId} WHERE order_id=${b.projection.orderId}`}));
});
withFixture('B12 revocation committed during admission wins; owner and membership rechecked',async f=>{
 const a=await f.prepared();let ready,release;const locked=new Promise(r=>ready=r),gate=new Promise(r=>release=r);
 const revoke=f.db.client.begin(async sql=>{await sql`UPDATE sessions SET revoked_at=now() WHERE id=${f.op.sessionId}`;ready();await gate;});await locked;
 const pending=f.repo.admit(f.op,a.input);const checked=reject(pending,'UNAUTHENTICATED');
 // The revoker already holds the row; commit order, not wall-clock sleeps, defines the outcome.
 release();await revoke;await checked;
 const other=await f.principal('OPERADOR');const r=await f.repo.register(other,id(),id());
 await f.db.client`UPDATE organization_memberships SET status='INACTIVE' WHERE organization_id=${other.organizationId} AND user_id=${other.userId}`;
 await reject(f.repo.read(other,r.projection.orderId),'UNAUTHENTICATED');
 // Confirmation must also linearize after a revocation, without creating an intent.
 const p=await f.principal('OPERADOR'),origin=id(),registered=await f.repo.register(p,id(),origin),input=f.admitInput(registered.projection.orderId,origin);
 await f.repo.admit(p,input);
 let lockedConfirm,releaseConfirm;const confirmLock=new Promise(r=>lockedConfirm=r),confirmGate=new Promise(r=>releaseConfirm=r);
 const revokeConfirm=f.db.client.begin(async sql=>{await sql`UPDATE sessions SET revoked_at=now() WHERE id=${p.sessionId}`;lockedConfirm();await confirmGate;});await confirmLock;
 const denied=reject(f.repo.confirm(p,{commandId:id(),orderId:input.orderId,submissionId:input.submissionId,expectedLedgerRevision:1}),'UNAUTHENTICATED');
 releaseConfirm();await revokeConfirm;await denied;
 assert.equal((await f.db.client`SELECT count(*)::int n FROM submission_communications WHERE submission_id=${input.submissionId}`)[0].n,0);
 await f.repo.owner(f.admin,{commandId:id(),orderId:input.orderId,ownerId:f.op2.userId,expectedAnchorRevision:2,reason:'Synthetic ownership transfer'});
 await f.db.client`UPDATE sessions SET revoked_at=NULL WHERE id=${p.sessionId}`;
 await reject(f.repo.confirm(p,{commandId:id(),orderId:input.orderId,submissionId:input.submissionId,expectedLedgerRevision:1}),'RESOURCE_UNAVAILABLE');
});
withFixture('B13 concurrent administrative resolutions use CAS and idempotent receipts',async f=>{
 const a=await f.intended(),proof=f.proof(a,'NO_EFFECT');await f.repo.recordLabEvidence(f.admin,f.decision(a,2),proof);
 const inputs=[1,2].map(()=>({...f.decision(a,3),evidenceId:proof.evidenceId,reason:'Synthetic resolution with exact proof'}));
 const results=await Promise.allSettled(inputs.map(i=>f.repo.resolve(f.admin,i)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
 const winner=results.findIndex(r=>r.status==='fulfilled');assert.equal((await f.repo.resolve(f.admin,inputs[winner])).replay,true);
 const event=(await f.repo.read(f.admin,a.orderId)).events.find(e=>e.command_id===inputs[winner].commandId);
 const envelope=Buffer.from(event.justification_encrypted.slice(2),'hex').toString('utf8');
 assert.equal(f.protection.open(envelope,{organizationId:f.admin.organizationId,orderId:a.orderId,submissionId:a.input.submissionId,kind:'justification',digest:event.justification_hash,identity:event.command_id}),inputs[winner].reason);
});
withFixture('B14 archive only rejected content; revised admission; released attempt never reexecutes',async f=>{
 const a=await f.intended();await f.repo.recordLabEvidence(f.admin,f.decision(a,2),f.proof(a,'REJECTED_FINAL'));
 const archive={...f.decision(a,3),expectedOrderRevision:1};await f.repo.archive(f.admin,archive);assert.equal((await f.repo.archive(f.admin,archive)).replay,true);
 await reject(f.repo.confirm(f.op,f.decision(a,4)),'OUTCOME_BLOCKED');assert.equal((await f.repo.confirm(f.op,a.confirm)).replay,true);
 const input={...a.input,commandId:id(),submissionId:id(),expectedOrderRevision:2};await reject(f.repo.admit(f.op,input),'CONTENT_UNCHANGED');
 input.bytes=submissionPayload({...JSON.parse(input.bytes),notes:'corrected synthetic order'});input.businessHash=hash(input.bytes);
 await reject(f.repo.admit(f.op,{...input,expectedOrderRevision:1}),'REVISION_CONFLICT');
 const next=await f.repo.admit(f.op,input);assert.equal(next.projection.orderRevision,3);assert.equal((await f.repo.read(f.op,a.orderId,a.input.submissionId)).projection.submission.releasedAt!==null,true);
});
withFixture('B15 contradictory late acceptance and reused external receipt create holds',async f=>{
 const a=await f.intended(),p=f.proof(a);await f.repo.recordLabEvidence(f.admin,f.decision(a,2),p);
 const r=await f.repo.recordLabEvidence(f.admin,f.decision(a,1),f.proof(a));assert.equal(r.projection.submission.state,'SUBMITTED');assert.equal(r.projection.submission.externalId,p.externalId);assert.equal(r.projection.conflictHold,true);
 const b=await f.intended();const collision=await f.repo.recordLabEvidence(f.admin,f.decision(b,2),f.proof(b,'ACCEPTED',{externalId:p.externalId}));assert.equal(collision.projection.conflictHold,true);
 const c=await f.intended();await f.repo.recordLabEvidence(f.admin,f.decision(c,2),f.proof(c,'REJECTED_FINAL'));await f.repo.archive(f.admin,{...f.decision(c,3),expectedOrderRevision:1});
 const revisedBytes=submissionPayload({...JSON.parse(c.input.bytes),notes:'Corrected synthetic revision'});
 const newer={...c.input,commandId:id(),submissionId:id(),expectedOrderRevision:2,bytes:revisedBytes,businessHash:hash(revisedBytes)};await f.repo.admit(f.op,newer);
 const late=await f.repo.recordLabEvidence(f.admin,f.decision(c,2),f.proof(c));
 const guarded=await f.repo.read(f.op,c.orderId,newer.submissionId);assert.equal(guarded.projection.submission.state,'READY');assert.equal(guarded.projection.submission.conflictHold,true);
 await reject(f.repo.confirm(f.op,{...f.decision(c,2),submissionId:newer.submissionId}),'RECOVERY_HOLD');assert.equal(late.projection.conflictHold,true);assert.equal(late.projection.submission.releasedAt!==null,true);
 assert.equal((await f.repo.read(f.admin,c.orderId,c.input.submissionId)).evidence.length,2);
});
withFixture('B16 rollback and post-commit ACK loss recover by same command',async f=>{
 const a=await f.prepared(),original=f.repo.apply.bind(f.repo);f.repo.apply=async(...args)=>{await original(...args);throw Error('INJECTED_PRE_COMMIT');};
 await reject(f.repo.admit(f.op,a.input),'LEDGER_UNAVAILABLE');assert.equal((await f.repo.read(f.op,a.orderId)).projection.currentSubmissionId,null);
 f.repo.apply=original;const committed=await f.repo.admit(f.op,a.input);
 // Simulate response loss after PostgreSQL returned COMMIT, outside the transaction.
 await assert.rejects((async()=>{await f.repo.admit(f.op,a.input);throw Error('INJECTED_ACK_LOSS');})(),/ACK_LOSS/);
 const replay=await f.repo.admit(f.op,a.input);assert.equal(replay.replay,true);assert.deepEqual(replay.commandReceipt,committed.commandReceipt);
 assert.equal((await f.db.client`SELECT count(*)::int n FROM submission_events WHERE action='ADMIT'`)[0].n,1);
});
withFixture('B17 actual process restart preserves snapshot, command, revision and uncertain hold',async f=>{
 const a=await f.intended();await f.repo.abandon(f.admin,f.decision(a,2));
 for(let i=0;i<2;i++){const w=await worker(f,{action:'read',principal:f.op,orderId:a.orderId,submissionId:a.input.submissionId});const r=await w.run();assert.equal(r.value.projection.submission.state,'UNKNOWN');assert.equal(r.value.communications.length,1);assert.equal(r.value.projection.submission.ledgerRevision,3);assert.equal(r.value.events.length,4);}
});
withFixture('B18 unavailable database, lock timeout and real deadlock roll back safely',async f=>{
 const a=await f.prepared();let release,ready;const gate=new Promise(r=>release=r),locked=new Promise(r=>ready=r);
 const holding=f.db.client.begin(async sql=>{await sql`SELECT 1 FROM submission_orders WHERE order_id=${a.orderId} FOR UPDATE`;ready();await gate;});await locked;
 try{await reject(f.repo.admit(f.op,a.input),'LEDGER_UNAVAILABLE');}finally{release();await holding;}
 const unavailable=new URL(f.runtimeUrl);unavailable.port='1';const down=database(unavailable.href);
 try{await reject(new SubmissionRepository(down,f.protection,f.gate).read(f.op,a.orderId),'LEDGER_UNAVAILABLE');}finally{await down.close();}
 const other=await f.prepared();let ra,rb,go;const pa=new Promise(r=>ra=r),pb=new Promise(r=>rb=r),both=new Promise(r=>go=r);
 const one=f.db.client.begin(async sql=>{await sql`SELECT 1 FROM submission_orders WHERE order_id=${a.orderId} FOR UPDATE`;ra();await both;await sql`SELECT 1 FROM submission_orders WHERE order_id=${other.orderId} FOR UPDATE`;});
 const two=f.db.client.begin(async sql=>{await sql`SELECT 1 FROM submission_orders WHERE order_id=${other.orderId} FOR UPDATE`;rb();await both;await sql`SELECT 1 FROM submission_orders WHERE order_id=${a.orderId} FOR UPDATE`;});
 const results=Promise.allSettled([one,two]);await Promise.all([pa,pb]);go();const settled=await results;assert.equal(settled.filter(r=>r.status==='rejected'&&r.reason.code==='40P01').length,1);
 assert.equal((await f.repo.admit(f.op,a.input)).projection.submission.state,'READY');
});
withFixture('B19 real old backup restoration while external RECOVERY_HOLD blocks admission and confirm',async f=>{
 const a=await f.prepared(),dump=execFileSync('pg_dump',[f.url,'--format=custom'],{maxBuffer:20e6});
 await f.repo.admit(f.op,a.input);const intent=await f.repo.confirm(f.op,f.decision(a));assert.ok(intent.commandReceipt.operationId);
 await writeFile(f.gatePath,JSON.stringify({...f.open,state:'RECOVERY_HOLD',windowStart:'backup',windowEnd:'restore',oldExecutorsStopped:true}));
 // Stop all runtime connections before destructive restore of the disposable synthetic database.
 await f.runtime.close();execFileSync('pg_restore',['--dbname='+f.url,'--clean','--if-exists','--no-owner'],{input:dump,maxBuffer:20e6,stdio:['pipe','pipe','pipe']});
 const restarted=database(f.runtimeUrl),repo=new SubmissionRepository(restarted,f.protection,f.gate);
 try{
  assert.equal((await repo.read(f.op,a.orderId)).projection.currentSubmissionId,null);
  await reject(repo.admit(f.op,a.input),'RECOVERY_HOLD');await reject(repo.confirm(f.op,f.decision(a)),'RECOVERY_HOLD');
  await writeFile(f.gatePath,'invalid');await reject(repo.admit(f.op,a.input),'RECOVERY_HOLD');
 }finally{await restarted.close();}
});
withFixture('B20 runtime cannot forge safeClosedAt or delete tombstones',async f=>{
 const a=await f.intended();for(const sql of ["UPDATE submission_communications SET potential_effect=false,safe_closed_at=now()",'DELETE FROM order_submissions','DELETE FROM submission_communications','TRUNCATE submission_orders CASCADE'])await assert.rejects(f.runtime.client.unsafe(sql),{code:'42501'});
 await assert.rejects(f.db.client`UPDATE submission_communications SET potential_effect=false,safe_closed_at=now() WHERE submission_id=${a.input.submissionId}`,{code:'23514'});
 await assert.rejects(f.db.client`DELETE FROM submission_communications WHERE submission_id=${a.input.submissionId}`,/IMMUTABLE_LEDGER/);
});
withFixture('B21 circular pointers reject other order, wrong state and evidence mismatch',async f=>{
 const a=await f.admitted(),b=await f.admitted();
 await assert.rejects(f.db.client.begin(async sql=>{await sql`UPDATE submission_orders SET current_submission_id=${b.input.submissionId} WHERE order_id=${a.orderId}`}));
 await assert.rejects(f.db.client.begin(async sql=>{await sql`UPDATE submission_orders SET accepted_submission_id=${a.input.submissionId} WHERE order_id=${a.orderId}`}),/POINTER_INVALID/);
 await assert.rejects(f.db.client.begin(async sql=>{await sql`UPDATE order_submissions SET accepted_evidence_id=${id()},external_order_id='synthetic-invalid',state='SUBMITTED',certainty='ACCEPTED' WHERE submission_id=${a.input.submissionId}`}));
 assert.equal((await f.repo.read(f.op,a.orderId)).projection.submission.state,'READY');
});
withFixture('B22 valid 300-item payload, bounded strings and excess bytes without partial commit',async f=>{
 const a=await f.prepared(),order={...demoOrder,orderId:a.origin,items:Array.from({length:300},(_,i)=>({...demoOrder.items[0],id:'item-'+i}))};
 const bytes=submissionPayload(order),start=performance.now();await f.repo.admit(f.op,{...a.input,bytes,businessHash:hash(bytes)});
 console.log('B22_PAYLOAD '+JSON.stringify({items:300,bytes:Buffer.byteLength(bytes),admissionMs:performance.now()-start,measurement:'PostgreSQL admission, not UI'}));
 const b=await f.prepared();for(const bad of [{...order,orderId:b.origin,notes:'x'.repeat(16385)},{...order,orderId:b.origin,items:[...order.items,{...order.items[0],id:'301'}]}]){const text=submissionPayload(bad);await reject(f.repo.admit(f.op,{...b.input,bytes:text,businessHash:hash(text)}),'INPUT_INVALID');}
 await reject(f.repo.admit(f.op,{...b.input,bytes:'x'.repeat(1048577),businessHash:'0'.repeat(64)}),'PAYLOAD_LIMIT');assert.equal((await f.repo.read(f.op,b.orderId)).projection.currentSubmissionId,null);
});
withFixture('B23 additive migration transaction failure and application rollback preserve ledger',async f=>{
 await applyMigrations(f.db);const a=await f.intended();
 const fresh=await isolatedDatabase();try{
  for(const name of ['0000_regular_taskmaster','0001_serious_grandmaster','0002_smiling_golden_guardian']){
   const text=await readFile(new URL('../../db/migrations/'+name+'.sql',import.meta.url),'utf8');
   await fresh.db.client.begin(async sql=>{for(const part of text.split('--> statement-breakpoint'))if(part.trim())await sql.unsafe(part);});
  }
  const migration=await readFile(new URL('../../db/migrations/0003_submission_ledger.sql',import.meta.url),'utf8');
  await assert.rejects(fresh.db.client.begin(async sql=>{await sql.unsafe(migration.split('--> statement-breakpoint')[0]);await sql`SELECT 1/0`;}));
  assert.equal((await fresh.db.client`SELECT to_regclass('submission_orders') name`)[0].name,null);
  assert.equal((await fresh.db.client`SELECT count(*)::int n FROM organizations`)[0].n,0);
 }finally{await fresh.cleanup();}
 // The pre-7B.4 readiness contract still works with the additive tables present.
 const {ready}=await import('../../db/readiness.ts');await ready(f.db);
 assert.equal((await f.repo.read(f.op,a.orderId)).communications.length,1);await applyMigrations(f.db);
 const journal=await f.db.client`SELECT count(*)::int n FROM drizzle.__drizzle_migrations`;assert.equal(journal[0].n,4);
});
withFixture('B24 audit sequence, actor, original receipt and no payload or tokens in events/errors',async f=>{
 const a=await f.intended(),proof=f.proof(a,'ACCEPTED',{details:'Synthetic private evidence marker: TEST_SECRET_NEVER_LOG'});
 const response=await f.repo.recordLabEvidence(f.admin,f.decision(a,2),proof);assert.equal(response.projection.submission.state,'SUBMITTED');
 const stored=await f.repo.read(f.admin,a.orderId);assert.deepEqual(stored.events.map(e=>e.sequence),[1,2,3,4]);assert.equal(stored.events[3].actor_id,f.admin.userId);
 const audit=JSON.stringify(stored.events);assert.ok(!audit.includes('TEST_SECRET_NEVER_LOG'));assert.ok(!audit.includes('Granola'));assert.ok(!audit.includes('session_token_hash'));
 assert.equal(stored.events[2].command_receipt.operationId,a.intent.commandReceipt.operationId);
 await assert.rejects(f.repo.read(f.other,a.orderId),e=>e.message==='RESOURCE_UNAVAILABLE'&&!JSON.stringify(e).includes(f.op.organizationId));
 assert.equal((await f.db.client`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`)[0].rolsuper,true);
 assert.equal((await f.db.client`SELECT count(*)::int n FROM audit_events WHERE action='SUBMISSION_DENIED'`)[0].n,1);
 assert.equal((await f.runtime.client`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`)[0].rolsuper,false);
 const first=await f.repo.auditPage(f.admin,a.orderId,0,2),second=await f.repo.auditPage(f.admin,a.orderId,first.nextSequence,2);
 assert.deepEqual([...first.items,...second.items].map(e=>e.sequence),[1,2,3,4]);assert.equal((await f.repo.auditPage(f.admin,a.orderId,second.nextSequence,2)).items.length,0);
 await reject(f.repo.auditPage(f.other,a.orderId),'RESOURCE_UNAVAILABLE');await reject(f.repo.auditPage(f.admin,a.orderId,0,101),'INPUT_INVALID');
 const pending=[];for(let i=0;i<2;i++){const b=await f.intended();await f.repo.abandon(f.admin,f.decision(b,2));pending.push(b.orderId);}
 const q1=await f.repo.pendingPage(f.admin,null,1),q2=await f.repo.pendingPage(f.admin,q1.nextOrderId,1);
 assert.deepEqual([q1.items[0].orderId,q2.items[0].orderId],pending.sort());assert.equal((await f.repo.pendingPage(f.admin,q2.nextOrderId,1)).items.length,0);
 assert.equal((await f.repo.pendingPage(f.other)).items.length,0);await reject(f.repo.pendingPage(f.op),'FORBIDDEN');
});
