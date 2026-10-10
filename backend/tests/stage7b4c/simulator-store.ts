import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { bindingSchema, type Binding, type Response } from '../../submissions/lab/contracts.ts';
import { hash } from '../../security/crypto.ts';
// DDL exclusively in a synthetic simulator database; NEVER an application migration.
export const simulatorDDL = `
 CREATE TABLE sim_received(id bigserial PRIMARY KEY,request_id uuid NOT NULL,binding jsonb NOT NULL,request text NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE sim_effects(id uuid PRIMARY KEY,binding jsonb NOT NULL,request text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE sim_rejections(id uuid PRIMARY KEY,account text NOT NULL,submission_id uuid NOT NULL,binding jsonb NOT NULL,UNIQUE(account,submission_id));
 CREATE TABLE mock_receipts(submission_id text PRIMARY KEY,order_id text NOT NULL UNIQUE,receipt jsonb NOT NULL);
 CREATE TABLE mock_rejections(submission_id text PRIMARY KEY,rejection jsonb NOT NULL);`;
export class SimulatorStore {
    readonly sql: ReturnType<typeof postgres>;
    constructor(url: string) { const u = new URL(url); if (!['localhost', '127.0.0.1'].includes(u.hostname) || !/^\/atram_test_sim/.test(u.pathname))
        throw Error('SYNTHETIC_DATABASE_REQUIRED'); this.sql = postgres(url, { max: 4, connect_timeout: 3, onnotice: () => { } }); }
    async receive(binding: Binding, request: string) { bindingSchema.parse(binding); if (hash(request) !== binding.requestHash || binding.account !== 'lab:' + binding.organizationId)
        throw Error('SIM_BINDING_INVALID'); const dto = JSON.parse(request); if (dto.mapper !== binding.mapper || dto.account !== binding.account || hash(dto.business) !== binding.businessHash)
        throw Error('SIM_BYTES_INVALID'); await this.sql `INSERT INTO sim_received(request_id,binding,request) VALUES(${randomUUID()},${this.sql.json(binding)},${request})`; }
    async effect(b: Binding, request: string, idempotent: boolean, reject = false): Promise<Response> {
        return this.sql.begin(async (sql) => {
            // Serializes rejection vs effect in this controlled simulator. It is NOT a
            // claim shared with the application. Normal non-idempotent mode always inserts.
            await sql `SELECT pg_advisory_xact_lock(hashtextextended(${b.account},44001))`;
            const [t] = await sql `SELECT * FROM sim_rejections WHERE account=${b.account} AND submission_id=${b.submissionId}`;
            if (t)
                return { binding: b, status: 400, kind: 'REJECTED_FINAL', tombstone: { id: t.id, submissionId: b.submissionId, pastEffects: 0, futureDeliveriesBlocked: true } };
            const prior = await sql `SELECT * FROM sim_effects WHERE binding->>'account'=${b.account} AND (binding->>'submissionId'=${b.submissionId} OR binding->>'orderId'=${b.orderId})`;
            if (reject) {
                if (prior.length)
                    return { binding: b, status: 500, kind: 'INCONCLUSIVE' };
                const id = randomUUID();
                await sql `INSERT INTO sim_rejections(id,account,submission_id,binding) VALUES(${id},${b.account},${b.submissionId},${sql.json(b)})`;
                return { binding: b, status: 400, kind: 'REJECTED_FINAL', tombstone: { id, submissionId: b.submissionId, pastEffects: 0, futureDeliveriesBlocked: true } };
            }
            if (idempotent && prior.length) {
                if (prior.length !== 1 || prior[0].request !== request)
                    return { binding: b, status: 409, kind: 'INCONCLUSIVE' };
                return { binding: b, status: 200, kind: 'ACCEPTED', externalId: prior[0].id };
            }
            const id = randomUUID();
            await sql `INSERT INTO sim_effects(id,binding,request) VALUES(${id},${sql.json(b)},${request})`;
            return { binding: b, status: 200, kind: 'ACCEPTED', externalId: id };
        }) as Promise<Response>;
    }
    async counts() { const [r] = await this.sql `SELECT (SELECT count(*)::int FROM sim_received) received,(SELECT count(*)::int FROM sim_effects) created`; return r; }
    async close() { await this.sql.end({ timeout: 3 }); }
}
