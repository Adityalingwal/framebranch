/**
 * Server tests run against a REAL Postgres (M7 lock B): a fake/in-memory
 * DB would prove nothing, because the G-group tests are precisely about
 * what the database itself does (unique register, one transaction, CAS).
 *
 * They call the route handlers DIRECTLY — real DB, no network, no port, no
 * running server — so the files share one database and must not run in
 * parallel with each other.
 *
 * The tiny .env reader below exists so that a plain `pnpm test` at the
 * repo root works locally (apps/web/.env is gitignored — see
 * .env.example). It never overrides a variable that is already set, so
 * CI's service-container DATABASE_URL always wins.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

function dotEnv(): Record<string, string> {
  const file = join(dirname(fileURLToPath(import.meta.url)), ".env");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    out[key] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: dotEnv(),
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
