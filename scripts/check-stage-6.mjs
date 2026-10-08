import { runStage6Checks } from '../services/stage6-checks.ts';
import { MemoryERPLedger } from '../integrations/erp-ledger.ts';
import { assertOrderTransition } from '../domain/submission.ts';
import { validateDraft } from '../repositories/draft-repository.ts';
const report=await runStage6Checks(async()=>{
 let saved;
 return {ledger:new MemoryERPLedger(),read:async()=>saved?structuredClone(saved):undefined,close:async()=>{},save:async(order,revision)=>{
  validateDraft({schemaVersion:3,orderId:order.orderId,revision:revision+1,savedAt:new Date().toISOString(),order});
  if((saved?.revision??0)!==revision)throw new Error('Conflicting revision');
  assertOrderTransition(saved?.order,order);saved=structuredClone({order,revision:revision+1});return revision+1;
 }};
});
console.log(JSON.stringify(report,null,2));
