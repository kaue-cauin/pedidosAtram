import type { Database } from '../db/client.ts';
import type { Principal } from '../auth/service.ts';
import { hash } from '../security/crypto.ts';
import { BackendError,fail } from '../security/errors.ts';
import { principalSession } from './authorization.ts';
import { SubmissionProtection } from './protection.ts';
import { RecoveryGate } from './recovery.ts';
import { CANONICAL,MAPPER,commandIdSchema,validateBytes,type Admission,type Decision,type CommandResult,type Projection,type LabProof } from './contracts.ts';
import { z } from 'zod';

type Sql=import('postgres').TransactionSql;
interface Stored {projection:Projection;origin:string;snapshot:string|null;request:string|null;events:Record<string,unknown>[];evidence:(Record<string,unknown>&{evidence_id:string;details_hash:string;envelope:string})[];communications:Record<string,unknown>[]}
const base=z.object({commandId:commandIdSchema,orderId:commandIdSchema,submissionId:commandIdSchema,expectedLedgerRevision:z.number().int().positive()}).strict();
const proofSchema=z.object({evidenceId:commandIdSchema,operationId:commandIdSchema,executionId:commandIdSchema,source:z.literal('LAB_ATTESTATION'),businessHash:z.string().regex(/^[a-f0-9]{64}$/),requestHash:z.string().regex(/^[a-f0-9]{64}$/),account:z.string().max(128),generation:z.literal(1),kind:z.enum(['ACCEPTED','REJECTED_FINAL','NO_EFFECT','INCONCLUSIVE']),externalId:z.string().min(1).max(128).optional(),transportNotInvoked:z.boolean().optional(),executionFenced:z.boolean().optional(),rejectsPastAndFuture:z.boolean().optional(),contentRejected:z.boolean().optional(),details:z.string().min(1).max(16384)}).strict();
const codes:Record<string,number>={UNAUTHENTICATED:401,FORBIDDEN:403,RESOURCE_UNAVAILABLE:404,INPUT_INVALID:422,EVIDENCE_INVALID:422,COMMAND_CONFLICT:409,IDENTITY_CONFLICT:409,REVISION_CONFLICT:409,ORDER_OCCUPIED:409,CONTENT_UNCHANGED:409,OUTCOME_BLOCKED:409,STATE_FORBIDDEN:409,RECOVERY_HOLD:503};
function parsed<T>(schema:z.ZodType<T>,value:unknown):T {const result=schema.safeParse(value);if(!result.success)fail('INPUT_INVALID',422);return result.data;}
export class SubmissionRepository {
  readonly db:Database; readonly protection:SubmissionProtection; readonly recovery:RecoveryGate;
  constructor(db:Database,protection:SubmissionProtection,recovery:RecoveryGate) {this.db=db;this.protection=protection;this.recovery=recovery;}
  private async transaction<T>(p:Principal,run:(sql:Sql)=>Promise<T>):Promise<T> {
    try {return await this.db.client.begin(async sql=>{await sql`SET LOCAL lock_timeout='3s'`;await sql`SET LOCAL statement_timeout='10s'`;return run(sql);}) as T;}
    catch(error) {
      const msg=error instanceof Error?error.message:'';
      const sanitized=error instanceof BackendError?error:new BackendError(Object.hasOwn(codes,msg)?msg:'LEDGER_UNAVAILABLE',codes[msg]??503);
      if(sanitized.status<500) {
        try {await this.db.client`SELECT submission_denial(${p.sessionId}::uuid,${sanitized.code})`;} catch { /* Original denial remains fail-closed if audit storage is unavailable. */ }
      }
      throw sanitized;
    }
  }
  private async readLocked(sql:Sql,p:Principal,orderId:string,submissionId?:string):Promise<Stored> {
    const [row]=await sql`SELECT submission_read(${principalSession(p)}::uuid,${parsed(commandIdSchema,orderId)}::uuid,${submissionId?parsed(commandIdSchema,submissionId):null}::uuid) AS value`;
    return row.value as Stored;
  }
  private async apply(sql:Sql,p:Principal,commandId:string,action:string,body:Record<string,unknown>):Promise<CommandResult> {
    const [row]=await sql`SELECT submission_command(${principalSession(p)}::uuid,${parsed(commandIdSchema,commandId)}::uuid,${action},${sql.json(body as never)}::jsonb) AS value`;
    return row.value as CommandResult;
  }
  async read(p:Principal,orderId:string,submissionId?:string) {return this.transaction(p,sql=>this.readLocked(sql,p,orderId,submissionId));}
  async register(p:Principal,commandId:string,origin:string) {
    parsed(z.string().min(1).max(128),origin);
    return this.transaction(p,sql=>this.apply(sql,p,commandId,'REGISTER',{origin}));
  }
  async admit(p:Principal,input:Admission) {
    parsed(z.object({commandId:commandIdSchema,orderId:commandIdSchema,submissionId:commandIdSchema,expectedOrderRevision:z.number().int().nonnegative(),sourceLocalRevision:z.number().int().nonnegative(),canonicalVersion:z.literal(CANONICAL),bytes:z.string(),businessHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),input);
    const business=validateBytes(input.bytes,input.businessHash);
    return this.transaction(p,async sql=>{
      const epoch=await this.recovery.assertOpen(),stored=await this.readLocked(sql,p,input.orderId,input.submissionId);
      if(business.orderId!==stored.origin)fail('IDENTITY_CONFLICT',409);
      const request=JSON.stringify({mapper:MAPPER,account:'lab:'+p.organizationId,business:input.bytes});
      const requestHash=hash(request),context={organizationId:p.organizationId,orderId:input.orderId,submissionId:input.submissionId};
      const snapshotContext={...context,kind:'snapshot' as const,digest:input.businessHash},requestContext={...context,kind:'request' as const,digest:requestHash};
      let snapshot:string,requestEnvelope:string;
      if(stored.snapshot && stored.projection.submission) {
        if(stored.projection.submission.businessHash!==input.businessHash||stored.projection.submission.requestHash!==requestHash)fail('IDENTITY_CONFLICT',409);
        if(this.protection.open(stored.snapshot,snapshotContext)!==input.bytes || this.protection.open(stored.request!,requestContext)!==request)fail('IDENTITY_CONFLICT',409);
        snapshot=stored.snapshot;requestEnvelope=stored.request!;
      } else {snapshot=this.protection.seal(input.bytes,snapshotContext);requestEnvelope=this.protection.seal(request,requestContext);}
      const result=await this.apply(sql,p,input.commandId,'ADMIT',{orderId:input.orderId,submissionId:input.submissionId,expectedOrderRevision:input.expectedOrderRevision,sourceLocalRevision:input.sourceLocalRevision,canonicalVersion:input.canonicalVersion,origin:business.orderId,businessHash:input.businessHash,requestHash,byteLength:Buffer.byteLength(input.bytes),snapshot,request:requestEnvelope,recoveryEpoch:epoch});
      await this.recovery.assertSame(epoch);return result;
    });
  }
  async confirm(p:Principal,input:Decision) {parsed(base,input);return this.transaction(p,async sql=>{
    const epoch=await this.recovery.assertOpen();const {commandId,...body}=input;
    const result=await this.apply(sql,p,commandId,'CONFIRM',{...body,recoveryEpoch:epoch});await this.recovery.assertSame(epoch);return result;
  });}
  async abandon(p:Principal,input:Decision) {parsed(base,input);const {commandId,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'ABANDON',body));}
  async lookup(p:Principal,input:Decision) {parsed(base,input);const {commandId,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'LOOKUP',body));}
  async archive(p:Principal,input:Decision & {expectedOrderRevision:number}) {parsed(base.extend({expectedOrderRevision:z.number().int().positive()}).strict(),input);const {commandId,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'ARCHIVE',body));}
  async owner(p:Principal,input:{commandId:string;orderId:string;ownerId:string;expectedAnchorRevision:number;reason:string}) {
    parsed(z.object({commandId:commandIdSchema,orderId:commandIdSchema,ownerId:commandIdSchema,expectedAnchorRevision:z.number().int().positive(),reason:z.string().min(1).max(1024)}).strict(),input);
    const {commandId,reason,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'OWNER',{...body,reasonHash:hash(reason),reasonEnvelope:this.protection.seal(reason,{organizationId:p.organizationId,orderId:input.orderId,submissionId:input.orderId,kind:'justification',digest:hash(reason),identity:commandId})}));
  }
  async hold(p:Principal,input:{commandId:string;orderId:string;expectedAnchorRevision:number}) {
    parsed(z.object({commandId:commandIdSchema,orderId:commandIdSchema,expectedAnchorRevision:z.number().int().positive()}).strict(),input);
    const {commandId,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'HOLD',body));
  }
  // Internal laboratory attestation boundary, never an HTTP/client classification or external simulator.
  // C/D must introduce a trusted evidence policy; these fixtures do not prove external effects.
  async recordLabEvidence(p:Principal,input:Decision,proof:LabProof) {
    parsed(base,input);parsed(proofSchema,proof);
    if((proof.kind==='ACCEPTED')!==Boolean(proof.externalId))fail('EVIDENCE_INVALID',422);
    if(proof.kind==='NO_EFFECT'&&(!proof.transportNotInvoked||!proof.executionFenced))fail('EVIDENCE_INVALID',422);
    if(proof.kind==='REJECTED_FINAL'&&(!proof.rejectsPastAndFuture||!proof.executionFenced))fail('EVIDENCE_INVALID',422);
    return this.transaction(p,async sql=>{
      const stored=await this.readLocked(sql,p,input.orderId,input.submissionId),detailsHash=hash(proof.details);
      const context={organizationId:p.organizationId,orderId:input.orderId,submissionId:input.submissionId,kind:'evidence' as const,digest:detailsHash,identity:proof.evidenceId};
      const previous=stored.evidence.find(e=>e.evidence_id===proof.evidenceId);
      if(previous&&(previous.details_hash!==detailsHash||this.protection.open(previous.envelope,context)!==proof.details))fail('EVIDENCE_INVALID',422);
      const {commandId,...body}=input;
      return this.apply(sql,p,commandId,'EVIDENCE',{...body,evidenceId:proof.evidenceId,operationId:proof.operationId,executionId:proof.executionId,conclusion:proof.kind,businessHash:proof.businessHash,requestHash:proof.requestHash,account:proof.account,generation:proof.generation,externalId:proof.externalId??null,contentRejected:proof.contentRejected??false,checks:{exactBinding:true,transportNotInvoked:proof.transportNotInvoked??false,executionFenced:proof.executionFenced??false,rejectsPastAndFuture:proof.rejectsPastAndFuture??false},detailsHash,detailsEnvelope:previous?.envelope??this.protection.seal(proof.details,context)});
    });
  }
  async blockBeforeIntent(p:Principal,input:Decision & {evidenceId:string;details:string}) {
    parsed(base.extend({evidenceId:commandIdSchema,details:z.string().min(1).max(16384)}).strict(),input);
    return this.transaction(p,async sql=>{
      const {commandId,details,...body}=input,detailsHash=hash(details);
      const stored=await this.readLocked(sql,p,input.orderId,input.submissionId);
      const previous=stored.evidence.find(e=>e.evidence_id===input.evidenceId);
      const context={organizationId:p.organizationId,orderId:input.orderId,submissionId:input.submissionId,kind:'evidence' as const,digest:detailsHash,identity:input.evidenceId};
      if(previous&&(previous.details_hash!==detailsHash||this.protection.open(previous.envelope,context)!==details))fail('EVIDENCE_INVALID',422);
      return this.apply(sql,p,commandId,'BLOCK',{...body,detailsHash,detailsEnvelope:previous?.envelope??this.protection.seal(details,context)});
    });
  }
  async resolve(p:Principal,input:Decision & {evidenceId:string;reason:string}) {
    parsed(base.extend({evidenceId:commandIdSchema,reason:z.string().min(1).max(1024)}).strict(),input);
    const {commandId,reason,...body}=input;return this.transaction(p,sql=>this.apply(sql,p,commandId,'RESOLVE',{...body,reasonHash:hash(reason),reasonEnvelope:this.protection.seal(reason,{organizationId:p.organizationId,orderId:input.orderId,submissionId:input.submissionId,kind:'justification',digest:hash(reason),identity:commandId})}));
  }
}
