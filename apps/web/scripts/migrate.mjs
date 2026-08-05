/**
 * migrate.mjs — THE one command that fills an empty database:
 *
 *   DATABASE_URL=... pnpm --filter @framebranch/web db:migrate
 *
 * It applies every committed file in apps/web/drizzle/ in order and is
 * idempotent (drizzle records applied migrations in its own journal
 * table), so CI can run it on a fresh service container every time and a
 * developer can run it twice without harm.
 *
 * Plain .mjs on purpose: this runs on Node 20, which cannot execute
 * TypeScript, and a migration runner must not need a bundler.
 */

/* global console, process */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  local: createdb framebranch && export DATABASE_URL=postgres://localhost:5432/framebranch",
  );
  process.exit(1);
}

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

const sql = postgres(url, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log(`migrations applied from ${migrationsFolder}`);
} finally {
  await sql.end();
}
