import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';
export function database(url: string) {
  // Drizzle overrides postgres.js date parsers/serializers to pass strings through.
  // Keep the parameterized operational SQL pool independent: it uses native Date values.
  const options = { connect_timeout: 5, idle_timeout: 20, onnotice: () => {} };
  const client = postgres(url, { ...options, max: 8 });
  const ormClient = postgres(url, { ...options, max: 2 });
  return { client, orm: drizzle(ormClient, { schema }), close: async () => { await Promise.all([client.end({ timeout: 5 }), ormClient.end({ timeout: 5 })]); } };
}
export type Database = ReturnType<typeof database>;
