import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import type { Database } from './client.ts';
// Explicit CLI only. Serializes concurrent migration invocations; never runs at server startup.
export async function applyMigrations(db: Database, journalSchema = 'drizzle') {
  await db.client.reserve().then(async connection => {
    try {
      await connection`SELECT pg_advisory_lock(72820261)`;
      await migrate(db.orm, { migrationsSchema: journalSchema, migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) });
    } finally { await connection`SELECT pg_advisory_unlock(72820261)`; connection.release(); }
  });
}
