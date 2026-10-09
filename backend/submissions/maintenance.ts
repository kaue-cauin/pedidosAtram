import type { Database } from '../db/client.ts';
import type { Principal } from '../auth/service.ts';
import { principalSession } from './authorization.ts';
import { SubmissionProtection } from './protection.ts';
import { fail } from '../security/errors.ts';
// Separate maintenance connection, never provided to the HTTP/backend runtime.
export async function rotateSubmission(db:Database,p:Principal,orderId:string,submissionId:string,old:SubmissionProtection,next:SubmissionProtection) {
  if(p.role!=='ADMIN')fail('FORBIDDEN',403);
  await db.client.begin(async sql=>{
    const [row]=await sql`SELECT submission_read(${principalSession(p)}::uuid,${orderId}::uuid,${submissionId}::uuid) value`;
    const v=row.value,s=v.projection.submission;if(!s)fail('RESOURCE_UNAVAILABLE',404);
    const c={organizationId:p.organizationId,orderId,submissionId};
    const snapshot=old.rotate(v.snapshot,{...c,kind:'snapshot',digest:s.businessHash},next);
    const request=old.rotate(v.request,{...c,kind:'request',digest:s.requestHash},next);
    await sql`SELECT submission_rotate(${p.sessionId}::uuid,${orderId}::uuid,${submissionId}::uuid,NULL,${v.snapshot},${snapshot},${v.request},${request})`;
    for(const e of v.evidence){
      const envelope=old.rotate(e.envelope,{...c,kind:'evidence',digest:e.details_hash,identity:e.evidence_id},next);
      await sql`SELECT submission_rotate(${p.sessionId}::uuid,${orderId}::uuid,${submissionId}::uuid,${e.evidence_id}::uuid,${e.envelope},${envelope})`;
    }
  });
}
