import { Vault, hash } from '../security/crypto.ts';
import { fail } from '../security/errors.ts';
import { CONTRACT,CANONICAL,MAPPER } from './contracts.ts';
export interface ProtectedContext { organizationId:string;orderId:string;submissionId:string;kind:'snapshot'|'request'|'evidence';digest:string;identity?:string }
function aad(c:ProtectedContext) {return JSON.stringify([CONTRACT,CANONICAL,MAPPER,c.orderId,c.submissionId,c.kind,c.digest,c.identity??'']);}
export class SubmissionProtection {
  constructor(readonly vault:Vault) {}
  seal(bytes:string,c:ProtectedContext) {if(hash(bytes)!==c.digest)fail('INTEGRITY_ERROR',422);return this.vault.seal(bytes,c.organizationId,aad(c));}
  open(envelope:string,c:ProtectedContext) {const bytes=this.vault.open(envelope,c.organizationId,aad(c));if(hash(bytes)!==c.digest)fail('INTEGRITY_ERROR',503);return bytes;}
  rotate(envelope:string,c:ProtectedContext,next:SubmissionProtection) {const bytes=this.open(envelope,c);const rotated=next.seal(bytes,c);if(next.open(rotated,c)!==bytes)fail('INTEGRITY_ERROR',503);return rotated;}
}
