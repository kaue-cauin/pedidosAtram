import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.ts';
import type { Quota } from '../../integrations/tiny-poc/transport.ts';
import { BackendError, fail } from '../security/errors.ts';
export class BudgetWait extends BackendError { readonly until:Date;readonly requested:boolean;constructor(until:Date,requested=false){super('BUDGET_WAIT',429);this.until=until;this.requested=requested;} }
export class AccountBudget {
  readonly db:Database;readonly interval:number;
  constructor(db:Database,interval=4000){if(!Number.isInteger(interval)||interval<4000||interval>60000)fail('SYNC_CONFIG_INVALID');this.db=db;this.interval=interval;}
  async claim(key:string,priority=false){
    if(!/^[a-f0-9]{64}$/.test(key))fail('ACCOUNT_KEY_INVALID');
    return this.db.client.begin(async sql=>{
      await sql`INSERT INTO sync_budgets(key) VALUES (${key}) ON CONFLICT DO NOTHING`;
      await sql`UPDATE sync_budgets SET remaining=NULL,reset_at=NULL WHERE key=${key} AND reset_at<=NOW()`;
      const [b]=await sql`SELECT *,NOW() now FROM sync_budgets WHERE key=${key} FOR UPDATE`;
      const now=(b.now as Date).getTime(),until=Math.max(b.next_at.getTime(),b.pause_until?.getTime()??0,b.lease?b.lease_until?.getTime()??0:0);
      if(until>now)throw new BudgetWait(new Date(until));
      // Reserve at least two reported requests for verification/future reconciliation.
      if(b.remaining!==null&&b.remaining<=(priority?0:2))throw new BudgetWait(b.reset_at??new Date(now+60000));
      const lease=randomUUID();await sql`UPDATE sync_budgets SET lease=${lease},lease_until=NOW()+interval '30 seconds',next_at=NOW()+${this.interval}*interval '1 millisecond',remaining=CASE WHEN remaining IS NULL THEN NULL ELSE GREATEST(0,remaining-1) END WHERE key=${key}`;return lease;
    });
  }
  async release(key:string,lease:string,quota:Quota={},status=200){
    const pause=status===429||quota.remaining!==undefined&&quota.remaining<=2;
    const seconds=Math.max(1,quota.retryAfterSeconds??quota.resetSeconds??60);
    await this.db.client`UPDATE sync_budgets SET lease=NULL,lease_until=NULL,remaining=${quota.remaining??null},reset_at=CASE WHEN ${quota.resetSeconds??null}::bigint IS NULL THEN NULL ELSE NOW()+${quota.resetSeconds??null}*interval '1 second' END,
      pause_until=CASE WHEN ${pause} THEN GREATEST(COALESCE(pause_until,NOW()),NOW()+${seconds}*interval '1 second') ELSE pause_until END WHERE key=${key} AND lease=${lease}`;
  }
}
