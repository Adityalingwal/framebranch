/**
 * client.ts — the single shared Postgres connection.
 *
 * The connection string comes from DATABASE_URL. Nothing is Neon-specific
 * or Homebrew-specific — the same URL shape drives both.
 *
 * The client is created lazily: importing this module without a running
 * database (during a build, or a test that never touches the DB) should
 * not fail.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let sql: ReturnType<typeof postgres> | null = null;
let dbInstance: Db | null = null;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/web/.env.example to apps/web/.env " +
        "(local Homebrew Postgres) or set it in the deployment environment.",
    );
  }
  return url;
}

export function getDb(): Db {
  if (!dbInstance) {
    // `max: 1` is deliberate for the demo: serverless functions each hold
    // their own pool, and one connection per instance keeps a free-tier
    // connection budget predictable. Not a correctness requirement.
    sql = postgres(databaseUrl(), { max: 1 });
    dbInstance = drizzle(sql, { schema });
  }
  return dbInstance;
}

/** Test/teardown helper — closes the pool so a test process can exit. */
export async function closeDb(): Promise<void> {
  if (sql) await sql.end({ timeout: 5 });
  sql = null;
  dbInstance = null;
}
