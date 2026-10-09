import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authFixture} from '../fixtures.mjs';
import {CatalogRepository} from '../../catalog/repository.ts';
import {resources} from '../../catalog/model.ts';
import {applyMigrations} from '../../db/migrate.ts';
test('7B.3A migrations, tenant FKs, staging, immutable publication, CAS and rollback',async()=>{
 const f=await authFixture();const r=new CatalogRepository(f.db),a=f.sa.principal,b=f.sb.principal;
 try {
  await applyMigrations(f.db);const job=await r.start(a,'FIXTURE');
  await assert.rejects(r.start(a,'FIXTURE'),e=>e.code==='SYNC_ALREADY_ACTIVE');
  await assert.rejects(f.db.client`INSERT INTO catalog_heads(organization_id,snapshot_id) VALUES (${b.organizationId},${job.snapshot_id})`,{code:'23503'});
  await assert.rejects(r.prepare(a,job.snapshot_id,['products']),e=>e.code==='COVERAGE_INCOMPLETE');
  assert.equal(await r.manifest(a),null);
  await r.put(a,job.snapshot_id,'products',{erpId:'001',commercial:'PENDING',unitOriginal:'CX'});
  await r.put(a,job.snapshot_id,'products',{erpId:'001',commercial:'PENDING',unitOriginal:'CX'});
  await r.prepare(a,job.snapshot_id,resources);
  await assert.rejects(r.put(a,job.snapshot_id,'products',{erpId:'2',commercial:'PENDING'}),e=>e.code==='SNAPSHOT_IMMUTABLE');
  await f.db.client`UPDATE sync_jobs SET status='COMPLETED' WHERE id=${job.id}`;
  await r.activate(a,job.snapshot_id,null);
  assert.equal((await r.manifest(a)).resources.products.count,1);assert.equal(await r.manifest(b),null);
  await assert.rejects(r.page(b,job.snapshot_id,'products',0,10),e=>e.code==='SNAPSHOT_UNAVAILABLE');
  await assert.rejects(r.activate(a,randomUUID(),null),e=>e.code==='HEAD_CHANGED');
  await f.db.client`UPDATE sync_jobs SET status='COMPLETED' WHERE id=${job.id}`;
  const next=await r.start(a,'FIXTURE');await r.prepare(a,next.snapshot_id,resources);await f.db.client`UPDATE sync_jobs SET status='COMPLETED' WHERE id=${next.id}`;
  await assert.rejects(r.activate(a,next.snapshot_id,job.snapshot_id),e=>e.code==='ANOMALY_REVIEW_REQUIRED');
  await r.activate(a,next.snapshot_id,job.snapshot_id,true);
  await r.activate(a,job.snapshot_id,next.snapshot_id,false,true);
  assert.equal((await r.manifest(a)).version,job.snapshot_id);
  assert.equal((await r.page(a,job.snapshot_id,'products',0,10)).items[0].unitOriginal,'CX');
 }finally{await f.cleanup();}
});
