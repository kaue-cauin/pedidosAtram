import type { Database } from './client.ts';
export async function ready(db: Database) {
  const [row] = await db.client`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'
    AND table_name IN ('organizations','users','organization_memberships','sessions','erp_connections','oauth_attempts','audit_events','login_limits')`;
  if (row.n !== 8) throw new Error('SCHEMA_NOT_READY');
}
