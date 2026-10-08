import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';
export function database(url: string) {
  const client = postgres(url, { max: 10, connect_timeout: 5, idle_timeout: 20, onnotice: () => {} });
  return { client, orm: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}
export type Database = ReturnType<typeof database>;
