import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.ts';
import { admin, uuid, type Principal } from '../auth/service.ts';
import { fail } from '../security/errors.ts';
import { resources, type CatalogMode, type DetailRequest, type Job, type Projection, type Resource } from './model.ts';
import { canonical, type CatalogManifest } from '../../domain/catalog-contract.ts';
import { hash } from '../security/crypto.ts';
export class CatalogRepository {
  readonly db:Database;
  constructor(db:Database) { this.db=db; }
  async start(p:Principal,mode:CatalogMode,connection?:{version:number;accountKey:string},details:DetailRequest[]=[]) {
    admin(p);
    return this.db.client.begin(async sql=>{
      await sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`;
      if((await sql`SELECT id FROM sync_jobs WHERE organization_id=${p.organizationId} AND status IN ('PENDING','RUNNING','PAUSED','RETRY_WAIT')`).length)fail('SYNC_ALREADY_ACTIVE',409);
      const [head]=await sql`SELECT snapshot_id FROM catalog_heads WHERE organization_id=${p.organizationId}`;
      const [snapshot]=await sql`INSERT INTO catalog_snapshots(organization_id,mode) VALUES (${p.organizationId},${mode}) RETURNING id`;
      const [job]=await sql`INSERT INTO sync_jobs(organization_id,requested_by,snapshot_id,mode,checkpoint,baseline_snapshot_id,connection_version,account_key)
        VALUES (${p.organizationId},${p.userId},${snapshot.id},${mode},${sql.json(JSON.parse(JSON.stringify({resourceIndex:0,offset:0,totals:{},completed:[],enrichment:{queue:details,index:0}})))},${head?.snapshot_id??null},${connection?.version??null},${connection?.accountKey??null}) RETURNING *`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},'SYNC_REQUEST','OK',${randomUUID()})`;
      return job as Job;
    });
  }
  async job(p:Principal,id:string):Promise<Job> {
    admin(p);if(!uuid(id))fail('INPUT_INVALID');
    const [row]=await this.db.client`SELECT * FROM sync_jobs WHERE organization_id=${p.organizationId} AND id=${id}`;
    if(!row)fail('JOB_NOT_FOUND',404);return row as Job;
  }
  async jobs(p:Principal) { admin(p);return this.db.client`SELECT id,snapshot_id,resource,mode,status,pages_processed,records_received,records_validated,records_quarantined,attempt_count,retry_after,error_code,created_at,started_at,finished_at FROM sync_jobs WHERE organization_id=${p.organizationId} ORDER BY created_at DESC LIMIT 50`; }
  async put(p:Principal,snapshot:string,resource:Resource,entry:Projection) {
    admin(p);if(!resources.includes(resource))fail('RESOURCE_DENIED');
    await this.db.client.begin(async sql=>{
      const [s]=await sql`SELECT status FROM catalog_snapshots WHERE organization_id=${p.organizationId} AND id=${snapshot} FOR UPDATE`;
      if(s?.status!=='BUILDING')fail('SNAPSHOT_IMMUTABLE',409);
      await sql`INSERT INTO catalog_entries(organization_id,snapshot_id,resource,erp_id,projection,content_hash,commercial) VALUES (${p.organizationId},${snapshot},${resource},${entry.erpId},${sql.json(JSON.parse(JSON.stringify(entry)))},${hash(canonical(entry))},${entry.commercial})
        ON CONFLICT(organization_id,snapshot_id,resource,erp_id) DO UPDATE SET projection=EXCLUDED.projection,content_hash=EXCLUDED.content_hash,commercial=EXCLUDED.commercial`;
    });
  }
  async prepare(p:Principal,snapshot:string,completed:readonly Resource[],maxRecords=10000) {
    admin(p);
    return this.db.client.begin(async sql=>{
      const [s]=await sql`SELECT * FROM catalog_snapshots WHERE organization_id=${p.organizationId} AND id=${snapshot} FOR UPDATE`;
      if(!s||s.status!=='BUILDING')fail('SNAPSHOT_IMMUTABLE',409);
      if(resources.some(r=>!completed.includes(r)))fail('COVERAGE_INCOMPLETE',409);
      // Resolve references only after every resource has been collected. Null is not an unknown ID.
      const unknown=await sql`SELECT e.erp_id FROM catalog_entries e WHERE e.organization_id=${p.organizationId} AND e.snapshot_id=${snapshot} AND e.resource='contacts' AND e.projection->>'sellerId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM catalog_entries v WHERE v.organization_id=e.organization_id AND v.snapshot_id=e.snapshot_id AND v.resource='sellers' AND v.erp_id=e.projection->>'sellerId')`;
      for(const c of unknown){
        await sql`INSERT INTO catalog_quarantine(organization_id,snapshot_id,resource,erp_id,reason,stage) VALUES (${p.organizationId},${snapshot},'contacts',${c.erp_id},'SELLER_REFERENCE_UNKNOWN','REFERENCES')`;
        await sql`UPDATE catalog_entries SET projection=jsonb_set(jsonb_set(projection,'{sellerLink}','"UNKNOWN_REFERENCE"'::jsonb),'{commercial}','"BLOCKED"'::jsonb),commercial='BLOCKED' WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} AND resource='contacts' AND erp_id=${c.erp_id}`;
      }
      await sql`UPDATE catalog_entries SET projection=jsonb_set(projection,'{sellerLink}','"RESOLVED"'::jsonb) WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} AND resource='contacts' AND projection->>'sellerId' IS NOT NULL AND projection->>'sellerLink'='PENDING_REFERENCE'`;
      const entries=await sql`SELECT resource,erp_id,projection,content_hash FROM catalog_entries WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} ORDER BY resource,erp_id LIMIT ${maxRecords+1}`;
      if(entries.length>maxRecords)fail('RECORD_LIMIT',409);
      for(const entry of entries){const checksum=hash(canonical(entry.projection));if(checksum!==entry.content_hash)await sql`UPDATE catalog_entries SET content_hash=${checksum} WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} AND resource=${entry.resource} AND erp_id=${entry.erp_id}`;}
      const counts:CatalogManifest['resources']={};
      for(const resource of resources) { const list=entries.filter(e=>e.resource===resource).map(e=>e.projection);counts[resource]={count:list.length,checksum:hash(canonical(list)),complete:true}; }
      const [q]=await sql`SELECT count(*)::int n FROM catalog_quarantine WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot}`;
      const anomalies:string[]=[];
      if(q.n)anomalies.push('QUARANTINE_PRESENT');
      const [head]=await sql`SELECT s.manifest FROM catalog_heads h JOIN catalog_snapshots s ON s.id=h.snapshot_id AND s.organization_id=h.organization_id WHERE h.organization_id=${p.organizationId}`;
      const old=head?.manifest?.resources;
      // Every disappearance requires explicit investigation; no arbitrary percentage proves safety.
      if(old){
        const changes=await sql`SELECT 1 FROM catalog_entries n JOIN catalog_entries e ON e.organization_id=n.organization_id AND e.resource=n.resource AND e.erp_id=n.erp_id AND e.snapshot_id=(SELECT snapshot_id FROM catalog_heads WHERE organization_id=${p.organizationId}) WHERE n.organization_id=${p.organizationId} AND n.snapshot_id=${snapshot} AND n.resource='products' AND (n.projection->'pricing' IS DISTINCT FROM e.projection->'pricing' OR n.projection->'unitOriginal' IS DISTINCT FROM e.projection->'unitOriginal' OR n.projection->'status' IS DISTINCT FROM e.projection->'status') LIMIT 1`;
        if(changes.length)anomalies.push('PRODUCT_COMMERCIAL_FIELDS_CHANGED');
      }
      if(old)for(const resource of resources) {
        if(counts[resource].count<old[resource]?.count)anomalies.push('COUNT_DROP_'+resource.toUpperCase());
        const missing=await sql`SELECT 1 FROM catalog_entries e WHERE e.organization_id=${p.organizationId} AND e.snapshot_id=(SELECT snapshot_id FROM catalog_heads WHERE organization_id=${p.organizationId}) AND e.resource=${resource}
          AND NOT EXISTS(SELECT 1 FROM catalog_entries n WHERE n.organization_id=e.organization_id AND n.snapshot_id=${snapshot} AND n.resource=e.resource AND n.erp_id=e.erp_id) LIMIT 1`;
        if(missing.length)anomalies.push('IDS_DISAPPEARED_'+resource.toUpperCase());
      }
      const manifest:CatalogManifest={version:snapshot,organizationId:p.organizationId,mode:s.mode,state:'READY',commercial:s.mode==='FIXTURE'?'SYNTHETIC_ONLY':'PENDING',createdAt:s.created_at.toISOString(),publishedAt:null,
        resources:counts,checksum:hash(canonical(counts)),cache:{maxAgeSeconds:3600,offlineAllowed:s.mode==='FIXTURE'},compatibility:'TECHNICAL_ONLY'};
      await sql`UPDATE catalog_snapshots SET status='READY',commercial=${manifest.commercial},manifest=${sql.json(JSON.parse(JSON.stringify(manifest)))},checksum=${manifest.checksum},anomalies=${sql.json(anomalies)} WHERE id=${snapshot} AND organization_id=${p.organizationId}`;
      return {manifest,anomalies};
    });
  }
  async activate(p:Principal,snapshot:string,expected:string|null,acknowledge=false,rollback=false) {
    admin(p);if(!uuid(snapshot)||expected!==null&&!uuid(expected))fail('INPUT_INVALID');
    return this.db.client.begin(async sql=>{
      await sql`SELECT id FROM organizations WHERE id=${p.organizationId} FOR UPDATE`;
      const permitted=await sql`SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.user_id=s.user_id AND m.organization_id=s.organization_id WHERE s.id=${p.sessionId} AND s.user_id=${p.userId} AND s.organization_id=${p.organizationId} AND s.revoked_at IS NULL AND s.expires_at>NOW() AND u.status='ACTIVE' AND m.status='ACTIVE' AND m.role='ADMIN' FOR SHARE OF s,u,m`;
      if(!permitted.length)fail('UNAUTHENTICATED',401);
      const [head]=await sql`SELECT snapshot_id,revision FROM catalog_heads WHERE organization_id=${p.organizationId}`;
      if((head?.snapshot_id??null)!==expected)fail('HEAD_CHANGED',409);
      const [s]=await sql`SELECT * FROM catalog_snapshots WHERE organization_id=${p.organizationId} AND id=${snapshot} FOR UPDATE`;
      if(!s||!(rollback?['SUPERSEDED']:['READY']).includes(s.status))fail('SNAPSHOT_NOT_READY',409);
      if(!rollback&&!(await sql`SELECT id FROM sync_jobs WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} AND status='COMPLETED'`).length)fail('JOB_NOT_COMPLETED',409);
      if(s.mode==='REAL'&&!(await sql`SELECT c.id FROM erp_connections c JOIN sync_jobs j ON j.organization_id=c.organization_id AND j.snapshot_id=${snapshot} WHERE c.organization_id=${p.organizationId} AND c.provider='TINY' AND c.status='CONNECTED' AND c.account_verified=true AND c.connection_generation=j.connection_version AND c.verified_account_identity=j.account_key AND j.status='COMPLETED' FOR SHARE OF c`).length)fail('CONNECTION_CHANGED',409);
      if((s.anomalies as string[]).length&&!acknowledge)fail('ANOMALY_REVIEW_REQUIRED',409);
      if(expected)await sql`UPDATE catalog_snapshots SET status='SUPERSEDED' WHERE id=${expected} AND organization_id=${p.organizationId}`;
      const manifest={...s.manifest,state:'ACTIVE',publishedAt:new Date().toISOString()};
      await sql`UPDATE catalog_snapshots SET status='ACTIVE',published_at=NOW(),manifest=${sql.json(JSON.parse(JSON.stringify(manifest)))} WHERE id=${snapshot} AND organization_id=${p.organizationId}`;
      await sql`INSERT INTO catalog_heads(organization_id,snapshot_id,revision) VALUES (${p.organizationId},${snapshot},1) ON CONFLICT(organization_id) DO UPDATE SET snapshot_id=EXCLUDED.snapshot_id,revision=catalog_heads.revision+1`;
      await sql`INSERT INTO audit_events(organization_id,user_id,action,result,correlation_id) VALUES (${p.organizationId},${p.userId},${rollback?'CATALOG_ROLLBACK':'CATALOG_ACTIVATE'},${acknowledge?'ANOMALIES_ACKNOWLEDGED':'OK'},${randomUUID()})`;
      return manifest as CatalogManifest;
    });
  }
  async manifest(p:Principal):Promise<CatalogManifest|null> {
    const [row]=await this.db.client`SELECT s.manifest FROM catalog_heads h JOIN catalog_snapshots s ON s.organization_id=h.organization_id AND s.id=h.snapshot_id WHERE h.organization_id=${p.organizationId}`;
    return row?.manifest??null;
  }
  async page(p:Principal,snapshot:string,resource:Resource,offset:number,limit:number) {
    if(!uuid(snapshot)||!resources.includes(resource)||!Number.isSafeInteger(offset)||offset<0||offset>10000||!Number.isInteger(limit)||limit<1||limit>100)fail('INPUT_INVALID');
    const [s]=await this.db.client`SELECT mode,status FROM catalog_snapshots WHERE organization_id=${p.organizationId} AND id=${snapshot} AND status IN ('ACTIVE','SUPERSEDED')`;
    if(!s)fail('SNAPSHOT_UNAVAILABLE',404);
    // Until a real projection policy is approved, only ADMIN can inspect real technical catalogues.
    if(s.mode==='REAL'&&p.role!=='ADMIN')fail('PROJECTION_POLICY_PENDING',403);
    const rows=await this.db.client`SELECT projection FROM catalog_entries WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} AND resource=${resource} ORDER BY erp_id LIMIT ${limit} OFFSET ${offset}`;
    return {version:snapshot,resource,offset,limit,items:rows.map(r=>r.projection)};
  }
  async quarantine(p:Principal,snapshot:string,offset=0) { admin(p);if(!uuid(snapshot)||!Number.isSafeInteger(offset)||offset<0||offset>10000)fail('INPUT_INVALID');return this.db.client`SELECT id,resource,erp_id,reason,stage,resolved,created_at FROM catalog_quarantine WHERE organization_id=${p.organizationId} AND snapshot_id=${snapshot} ORDER BY created_at,id LIMIT 100 OFFSET ${offset}`; }
}
