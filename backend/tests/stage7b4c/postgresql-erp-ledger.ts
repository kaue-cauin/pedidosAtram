import postgres from 'postgres';
import type { ERPLedger } from '../../../integrations/erp-ledger.ts';
import { sameReceipt } from '../../../integrations/erp-ledger.ts';
import { ERPFailure, type ERPReceipt, type ERPRejection } from '../../../integrations/ERPProvider.ts';
export class PostgreSQLERPLedger implements ERPLedger {
    readonly sql: ReturnType<typeof postgres>;
    constructor(url: string) { const u = new URL(url); if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !/^\/atram_test_sim/.test(u.pathname))
        throw Error('SYNTHETIC_DATABASE_REQUIRED'); this.sql = postgres(url, { max: 4, onnotice: () => { } }); }
    async find(id: string) { const [r] = await this.sql `SELECT receipt FROM mock_receipts WHERE submission_id=${id}`; return r?.receipt as ERPReceipt ?? null; }
    async findRejection(id: string) { const [r] = await this.sql `SELECT rejection FROM mock_rejections WHERE submission_id=${id}`; return r?.rejection as ERPRejection ?? null; }
    async create(incoming: ERPReceipt) { return this.mutate(incoming, true) as Promise<ERPReceipt>; }
    async reject(incoming: ERPRejection) { return this.mutate(incoming, false); }
    private async mutate(incoming: ERPReceipt | ERPRejection, create: boolean) {
        return this.sql.begin(async (sql) => {
            await sql `SELECT pg_advisory_xact_lock(44002)`;
            const [r] = await sql `SELECT receipt FROM mock_receipts WHERE submission_id=${incoming.submissionId} OR order_id=${incoming.orderId}`;
            if (r)
                return sameReceipt(r.receipt, { ...incoming, erpOrderId: r.receipt.erpOrderId });
            const [rejected] = await sql `SELECT rejection FROM mock_rejections WHERE submission_id=${incoming.submissionId}`;
            if (rejected) {
                if (!create && rejected.rejection.orderId === incoming.orderId && rejected.rejection.payload === incoming.payload)
                    return rejected.rejection;
                if (rejected.rejection.orderId !== incoming.orderId || rejected.rejection.payload !== incoming.payload)
                    throw new ERPFailure('Synthetic identity conflict', 'unknown');
                throw new ERPFailure('Synthetic final rejection', 'rejected', 0, 'validation');
            }
            if (create)
                await sql `INSERT INTO mock_receipts VALUES(${incoming.submissionId},${incoming.orderId},${sql.json(incoming as never)})`;
            else
                await sql `INSERT INTO mock_rejections VALUES(${incoming.submissionId},${sql.json(incoming as never)})`;
            return incoming;
        }) as Promise<ERPReceipt | ERPRejection>;
    }
    async close() { await this.sql.end({ timeout: 3 }); }
}
