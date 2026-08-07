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
