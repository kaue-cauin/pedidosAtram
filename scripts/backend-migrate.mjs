import { database } from '../backend/db/client.ts';
import { applyMigrations } from '../backend/db/migrate.ts';
let db;
try {
  const url=new URL(process.env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error();
  db=database(url.href); await applyMigrations(db); console.log('MIGRATIONS_APPLIED');
} catch {console.error('MIGRATION_FAILED');process.exitCode=1;} finally {await db?.close();}
