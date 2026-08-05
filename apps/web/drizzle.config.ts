/**
 * drizzle-kit config — M7 lock C: tables come from a MIGRATION FILE.
 *
 * `pnpm --filter @framebranch/web db:generate` regenerates
 * `apps/web/drizzle/*.sql` from `src/db/schema.ts`; the .sql is committed
 * so a reviewer can read the data model at a glance and CI can fill an
 * empty database with one command. Schema-push is deliberately NOT the
 * primary path.
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/framebranch",
  },
});
