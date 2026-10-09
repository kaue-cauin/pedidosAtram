import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/service.ts';
import { admin } from '../auth/service.ts';
import { BackendError, fail } from '../security/errors.ts';
import type { Quota } from '../../integrations/tiny-poc/transport.ts';
import { CatalogRepository } from './repository.ts';
import { resources, type Resource, type Job, type Checkpoint, type DetailRequest, type Projection } from './model.ts';
import { enrichProduct, mapPriceList } from './mappers.ts';
import { identity, page } from './pagination.ts';
import { AccountBudget, BudgetWait } from './budget.ts';
import { canonical } from '../../domain/catalog-contract.ts';
import { hash } from '../security/crypto.ts';
export interface PageSource { detail?(p:Principal,resource:'products'|'priceLists',id:string,version:number|null):Promise<{data:unknown;status:number;quota:Quota}>;mode:'FIXTURE'|'REAL';binding?(p:Principal):Promise<{version:number;accountKey:string}>;read(p:Principal,resource:Resource,offset:number,limit:number,version:number|null):Promise<{data:unknown;status:number;quota:Quota}> }
export interface SyncOptions { detail?:boolean;real:boolean;fixture:boolean;pageSize:number;maxPages:number;maxRecords:number;maxAttempts:number;intervalMs:number }
export type Mapper=(resource:Resource,item:unknown,mode:'FIXTURE'|'REAL')=>Projection;
const basic:Mapper=(_resource,item)=>({erpId:identity((item as Record<string,unknown>).id),commercial:'PENDING'});
export class CatalogEngine {
  readonly repository:CatalogRepository;readonly source:PageSource;readonly options:SyncOptions;readonly budget:AccountBudget;readonly mapper:Mapper;
  constructor(repository:CatalogRepository,source:PageSource,options:SyncOptions,mapper:Mapper=basic){
    if(!Number.isInteger(options.pageSize)||options.pageSize<1||options.pageSize>50||!Number.isInteger(options.maxPages)||options.maxPages<4||options.maxPages>2000||!Number.isInteger(options.maxRecords)||options.maxRecords<1||options.maxRecords>10000||!Number.isInteger(options.maxAttempts)||options.maxAttempts<1||options.maxAttempts>5)fail('SYNC_CONFIG_INVALID');
    this.repository=repository;this.source=source;this.options=options;this.budget=new AccountBudget(repository.db,options.intervalMs);this.mapper=mapper;
  }
  private gate(){if(!(this.source.mode==='REAL'?this.options.real:this.options.fixture))fail(this.source.mode==='REAL'?'REAL_SYNC_DISABLED':'FIXTURE_SYNC_DISABLED',403);}
  private async authorized(p:Principal){
    admin(p);const rows=await this.repository.db.client`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id WHERE s.id=${p.sessionId} AND s.user_id=${p.userId} AND s.organization_id=${p.organizationId} AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE' AND o.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN'`;
    if(!rows.length)fail('UNAUTHENTICATED',401);
  }
  async start(p:Principal,details:DetailRequest[]=[]){this.gate();await this.authorized(p);if(!Array.isArray(details)||details.length>10||details.some(d=>!['products','priceLists'].includes(d.resource)||identity(d.id)!==d.id)||new Set(details.map(d=>d.resource+':'+d.id)).size!==details.length)fail('INPUT_INVALID');if(details.length&&(!this.options.detail||!this.source.detail))fail('DETAIL_DISABLED',403);const binding=this.source.mode==='REAL'?await this.source.binding!(p):undefined;return this.repository.start(p,this.source.mode,binding,details);}
  async cancel(p:Principal,id:string){
    await this.authorized(p);await this.repository.job(p,id);
    await this.repository.db.client.begin(async sql=>{
      const rows=await sql`UPDATE sync_jobs SET status='CANCELLED',execution_id=NULL,lease_until=NULL,finished_at=NOW(),error_code='CANCELLED' WHERE organization_id=${p.organizationId} AND id=${id} AND status IN ('PENDING','RUNNING','PAUSED','RETRY_WAIT') RETURNING snapshot_id`;
      if(!rows.length)fail('JOB_NOT_RUNNING',409);
      await sql`UPDATE catalog_snapshots SET status='INCOMPLETE' WHERE organization_id=${p.organizationId} AND id=${rows[0].snapshot_id} AND status IN ('BUILDING','READY')`;
    });
  }
  async resume(p:Principal,id:string){
    this.gate();await this.authorized(p);await this.repository.job(p,id);
    return this.repository.db.client.begin(async sql=>{
      const [j]=await sql`SELECT * FROM sync_jobs WHERE id=${id} AND organization_id=${p.organizationId} FOR UPDATE`;
      if(j.mode!==this.source.mode)fail('MODE_MISMATCH',409);
      if(!['RUNNING','RETRY_WAIT','PAUSED'].includes(j.status)||j.lease_until&&j.lease_until>new Date())fail('JOB_NOT_RESUMABLE',409);
      if(j.retry_after&&j.retry_after>new Date())fail('RETRY_NOT_DUE',429);
      // Offset pages may have moved during a crash. Restart staging; never resume into an unproven coverage set.
      await sql`DELETE FROM catalog_entries WHERE snapshot_id=${j.snapshot_id} AND organization_id=${p.organizationId}`;
      await sql`DELETE FROM catalog_quarantine WHERE snapshot_id=${j.snapshot_id} AND organization_id=${p.organizationId}`;
      const [next]=await sql`UPDATE sync_jobs SET status='PENDING',execution_id=NULL,lease_until=NULL,retry_after=NULL,error_code=NULL,checkpoint=${sql.json({resourceIndex:0,offset:0,totals:{},completed:[],enrichment:{queue:j.checkpoint.enrichment?.queue??[],index:0}})},pages_processed=0,records_received=0,records_validated=0,records_quarantined=0 WHERE id=${id} AND organization_id=${p.organizationId} RETURNING *`;
      return next as Job;
    });
  }
  async step(p:Principal,id:string){
    this.gate();await this.authorized(p);await this.repository.job(p,id);
    const execution=randomUUID(),db=this.repository.db;
    const job=await db.client.begin(async sql=>{
      const [j]=await sql`SELECT * FROM sync_jobs WHERE organization_id=${p.organizationId} AND id=${id} FOR UPDATE`;
      if(j.mode!==this.source.mode)fail('MODE_MISMATCH',409);
      if(j.status==='RUNNING'&&j.execution_id)fail(j.lease_until>new Date()?'JOB_BUSY':'RECOVERY_REQUIRED',409);
      if(!['PENDING','RUNNING','RETRY_WAIT'].includes(j.status))fail('JOB_NOT_RUNNING',409);
      if(j.retry_after&&j.retry_after>new Date())fail('RETRY_NOT_DUE',429);
      const owner=await sql`SELECT user_id FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=${j.requested_by} AND m.organization_id=${p.organizationId} AND m.role='ADMIN' AND m.status='ACTIVE' AND u.status='ACTIVE'`;
      if(!owner.length)fail('REQUESTER_REVOKED',403);
      const [claimed]=await sql`UPDATE sync_jobs SET status='RUNNING',execution_id=${execution},lease_until=NOW()+interval '30 seconds',started_at=COALESCE(started_at,NOW()),retry_after=NULL WHERE id=${id} RETURNING *`;return claimed as Job;
    });
    let budgetLease:string|undefined;
    try {
      const detail=job.checkpoint.resourceIndex===resources.length?job.checkpoint.enrichment?.queue[job.checkpoint.enrichment.index]:undefined;
      if(detail){
        if(!this.options.detail||!this.source.detail)fail('DETAIL_DISABLED',403);
        const [existing]=await db.client`SELECT projection FROM catalog_entries WHERE organization_id=${p.organizationId} AND snapshot_id=${job.snapshot_id} AND resource=${detail.resource} AND erp_id=${detail.id}`;
        if(!existing)fail('DETAIL_TARGET_UNAVAILABLE',409);
        if(job.mode==='REAL'){
          const binding=await this.source.binding!(p);if(binding.version!==job.connection_version||binding.accountKey!==job.account_key)fail('CONNECTION_CHANGED',409);
          budgetLease=await this.budget.claim(job.account_key!);
        }
        const response=await this.source.detail(p,detail.resource,detail.id,job.connection_version);
        if(budgetLease){await this.budget.release(job.account_key!,budgetLease,response.quota,response.status);budgetLease=undefined;}
        if(response.status===429)throw new BudgetWait(new Date(Date.now()+Math.max(1,response.quota.retryAfterSeconds??response.quota.resetSeconds??60)*1000),true);
        if(response.status!==200)fail(response.status>=500?'ERP_TRANSIENT':response.status===401?'REAUTH_REQUIRED':response.status===403?'PERMISSION_DENIED':'DETAIL_REQUEST_REJECTED',503);
        const entry=detail.resource==='products'?enrichProduct(existing.projection,response.data):{...existing.projection,...mapPriceList(response.data,job.mode),detailSource:'GET /listas-precos/{id}'};
        if(entry.erpId!==detail.id)fail('DETAIL_ID_CONFLICT');
        await this.authorized(p);
        await db.client.begin(async sql=>{
          const [current]=await sql`SELECT id FROM sync_jobs WHERE id=${id} AND organization_id=${p.organizationId} AND status='RUNNING' AND execution_id=${execution} AND lease_until>NOW() FOR UPDATE`;
          if(!current)fail('EXECUTION_STALE',409);
          const permitted=await sql`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id WHERE s.id=${p.sessionId} AND s.user_id=${p.userId} AND s.organization_id=${p.organizationId} AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN' FOR SHARE OF s,u,m`;
          if(!permitted.length)fail('UNAUTHENTICATED',401);
          if(job.mode==='REAL'&&!(await sql`SELECT id FROM erp_connections WHERE organization_id=${p.organizationId} AND status='CONNECTED' AND account_verified=true AND connection_generation=${job.connection_version} AND verified_account_identity=${job.account_key} FOR SHARE`).length)fail('CONNECTION_CHANGED',409);
          await sql`UPDATE catalog_entries SET projection=${sql.json(JSON.parse(JSON.stringify(entry)))},content_hash=${hash(canonical(entry))},commercial=${entry.commercial} WHERE organization_id=${p.organizationId} AND snapshot_id=${job.snapshot_id} AND resource=${detail.resource} AND erp_id=${detail.id}`;
          job.checkpoint.enrichment!.index++;
          await sql`UPDATE sync_jobs SET checkpoint=${sql.json(JSON.parse(JSON.stringify(job.checkpoint)))},execution_id=NULL,lease_until=NULL,resource=${detail.resource},error_code=NULL WHERE id=${id}`;
        });return {status:'RUNNING',enriched:detail.id};
      }
      if(job.checkpoint.resourceIndex===resources.length){
        await this.repository.prepare(p,job.snapshot_id,job.checkpoint.completed,this.options.maxRecords);
        const done=await db.client.begin(async sql=>{
        if(job.mode==='REAL'&&!(await sql`SELECT id FROM erp_connections WHERE organization_id=${p.organizationId} AND status='CONNECTED' AND account_verified=true AND connection_generation=${job.connection_version} AND verified_account_identity=${job.account_key} FOR SHARE`).length)fail('CONNECTION_CHANGED',409);
        return sql`UPDATE sync_jobs SET status='COMPLETED',records_quarantined=(SELECT count(DISTINCT (resource,erp_id))::int FROM catalog_quarantine WHERE organization_id=${p.organizationId} AND snapshot_id=${job.snapshot_id}),finished_at=NOW(),execution_id=NULL,lease_until=NULL,error_code=NULL WHERE id=${id} AND organization_id=${p.organizationId} AND execution_id=${execution} AND lease_until>NOW() AND status='RUNNING' RETURNING id`;});
        if(!done.length)fail('EXECUTION_STALE',409);return {status:'COMPLETED'};
      }
      if(job.pages_processed>=this.options.maxPages)fail('PAGE_LIMIT',409);
      const resource=resources[job.checkpoint.resourceIndex];if(!resource)fail('CHECKPOINT_INVALID',409);
      if(job.mode==='REAL'){
        const current=await this.source.binding!(p);if(current.version!==job.connection_version||current.accountKey!==job.account_key)fail('CONNECTION_CHANGED',409);
        budgetLease=await this.budget.claim(job.account_key!);
      }
      const response=await this.source.read(p,resource,job.checkpoint.offset,this.options.pageSize,job.connection_version);
      if(budgetLease){await this.budget.release(job.account_key!,budgetLease,response.quota,response.status);budgetLease=undefined;}
      if(response.status!==200){
        if(response.status===429)throw new BudgetWait(new Date(Date.now()+Math.max(1,response.quota.retryAfterSeconds??response.quota.resetSeconds??60)*1000),true);
        fail(response.status===401?'REAUTH_REQUIRED':response.status===403?'PERMISSION_DENIED':response.status>=500?'ERP_TRANSIENT':'ERP_REQUEST_REJECTED',response.status>=500?503:response.status);
      }
      const parsed=page(response.data,job.checkpoint.offset,this.options.pageSize,this.options.maxRecords,job.checkpoint.totals[resource],job.checkpoint.previousPageHash);
      if(job.records_received+parsed.items.length>this.options.maxRecords)fail('RECORD_LIMIT',409);
      await this.authorized(p);
      if(job.mode==='REAL'){const binding=await this.source.binding!(p);if(binding.version!==job.connection_version||binding.accountKey!==job.account_key)fail('CONNECTION_CHANGED',409);}
      const mapped=parsed.items.map((item,i)=>{try{return {id:parsed.ids[i],entry:this.mapper(resource,item,job.mode)};}catch(e){return {id:parsed.ids[i],reason:e instanceof BackendError?e.code:'MAPPING_INVALID'};}});
      const checkpoint:Checkpoint={...job.checkpoint,offset:parsed.next,previousPageHash:parsed.checksum,totals:{...job.checkpoint.totals,[resource]:parsed.total}};
      if(parsed.complete){checkpoint.resourceIndex++;checkpoint.offset=0;checkpoint.completed=[...checkpoint.completed,resource];delete checkpoint.previousPageHash;}
      await db.client.begin(async sql=>{
        const [current]=await sql`SELECT id FROM sync_jobs WHERE id=${id} AND organization_id=${p.organizationId} AND status='RUNNING' AND execution_id=${execution} AND lease_until>NOW() FOR UPDATE`;
        if(!current)fail('EXECUTION_STALE',409);
        const permitted=await sql`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=s.organization_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id WHERE s.id=${p.sessionId} AND s.organization_id=${p.organizationId} AND s.user_id=${p.userId} AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE' AND o.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN' FOR SHARE OF s,u,o,m`;
        if(!permitted.length)fail('UNAUTHENTICATED',401);
        if(job.mode==='REAL'){
          const connection=await sql`SELECT id FROM erp_connections WHERE organization_id=${p.organizationId} AND provider='TINY' AND status='CONNECTED' AND account_verified=true AND connection_generation=${job.connection_version} AND verified_account_identity=${job.account_key} FOR SHARE`;
          if(!connection.length)fail('CONNECTION_CHANGED',409);
        }
        const duplicates=await sql`SELECT erp_id FROM catalog_entries WHERE organization_id=${p.organizationId} AND snapshot_id=${job.snapshot_id} AND resource=${resource} AND erp_id IN ${sql(parsed.ids.length?parsed.ids:[''])}`;
        const quarantinedDuplicates=await sql`SELECT erp_id FROM catalog_quarantine WHERE organization_id=${p.organizationId} AND snapshot_id=${job.snapshot_id} AND resource=${resource} AND erp_id IN ${sql(parsed.ids.length?parsed.ids:[''])}`;
        if(duplicates.length||quarantinedDuplicates.length)fail('DUPLICATE_ID',409);
        for(const row of mapped){
          if(row.entry){if(row.entry.erpId!==row.id)fail('MAPPING_ID_CONFLICT');await sql`INSERT INTO catalog_entries(organization_id,snapshot_id,resource,erp_id,projection,content_hash,commercial) VALUES (${p.organizationId},${job.snapshot_id},${resource},${row.id},${sql.json(JSON.parse(JSON.stringify(row.entry)))},${hash(canonical(row.entry))},${row.entry.commercial})`;}
          else await sql`INSERT INTO catalog_quarantine(organization_id,snapshot_id,resource,erp_id,reason,stage) VALUES (${p.organizationId},${job.snapshot_id},${resource},${row.id},${row.reason!},'MAPPING')`;
        }
        const valid=mapped.filter(x=>x.entry).length;
        await sql`UPDATE sync_jobs SET checkpoint=${sql.json(JSON.parse(JSON.stringify(checkpoint)))},resource=${resource},pages_processed=pages_processed+1,records_received=records_received+${parsed.items.length},records_validated=records_validated+${valid},records_quarantined=records_quarantined+${mapped.length-valid},execution_id=NULL,lease_until=NULL,error_code=NULL WHERE id=${id}`;
      });
      return {status:'RUNNING',resource,offset:checkpoint.offset,pages:job.pages_processed+1};
    }catch(e){
      const code=e instanceof BackendError?e.code:(e&&typeof e==='object'&&'kind' in e&&typeof e.kind==='string'?e.kind:'ERP_TRANSIENT');
      const waiting=e instanceof BudgetWait,transient=['ERP_TRANSIENT','TIMEOUT','NETWORK','READ_BUSY','REFRESH_BUSY'].includes(code),attempts=job.attempt_count+(waiting&&!e.requested?0:1);
      const retry=waiting&&!e.requested||(waiting||transient)&&attempts<this.options.maxAttempts;
      const until=waiting?e.until:new Date(Date.now()+Math.min(60000,1000*2**attempts)+Math.floor(Math.random()*250));
      await db.client.begin(async sql=>{
        const changed=await sql`UPDATE sync_jobs SET status=${retry?'RETRY_WAIT':'FAILED'},retry_after=${retry?until:null},error_code=${code},attempt_count=${attempts},execution_id=NULL,lease_until=NULL,finished_at=CASE WHEN ${retry} THEN NULL ELSE NOW() END WHERE id=${id} AND organization_id=${p.organizationId} AND execution_id=${execution} AND status='RUNNING' RETURNING snapshot_id`;
        if(changed.length&&!retry)await sql`UPDATE catalog_snapshots SET status='INCOMPLETE' WHERE organization_id=${p.organizationId} AND id=${job.snapshot_id} AND status IN ('BUILDING','READY')`;
      });throw e;
    }finally{if(budgetLease)await this.budget.release(job.account_key!,budgetLease);}
  }
}
