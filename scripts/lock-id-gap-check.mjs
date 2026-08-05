#!/usr/bin/env node
/**
 * lock-id-gap-check.mjs — docs/12 T1's first "missing test" guard, and the
 * fail-blocking half of T5 step 5.
 *
 * WHAT IT DOES
 *   Reads the LOCK IDs out of the canonical docs and cross-checks them
 *   against the names of the tests in this repo. A lock that is in scope and
 *   has no test anywhere is printed as `BC.4 has no test` and the script
 *   exits 1, which fails CI. (T1: "Aditya tests PADHEGA nahi — system report
 *   karega".)
 *
 * WHERE THE IDS COME FROM
 *   docs/11 — every locked outcome is written as a list item that starts
 *             `- **<ID> …`; that is the whole extraction rule.
 *   docs/12 — the G-group (5 server/state tests) and the H-group (11 OTIO
 *             goldens) from the F11 amendment and the M5 test additions.
 *
 * WHICH LOCKS ARE IN SCOPE (T5's activation clarification, 2026-08-04)
 *   The gap-script runs now because M2–M7's lock universe is implemented.
 *   Locks belonging to a milestone that is not built yet must not be
 *   reported as missing. Deciding that needed NO milestone-aware machinery
 *   here, because of a fact about the docs themselves: every lock ID in
 *   docs/11 and every G/H id in docs/12 belongs to the engine (M2–M6) or the
 *   server (M7), all of which are now implemented. The only locks for a
 *   future milestone are M8's UI decisions, and those live in docs/07's
 *   prose — a document this script does not read. So the in-scope list is
 *   "everything the two files above yield", minus the explicit, reasoned
 *   EXCLUSIONS below.
 *
 * HOW A LOCK COUNTS AS TESTED
 *   Its id appears as a whole token inside a `describe(…)`, `it(…)`,
 *   `it.each(…)(…)` or `test(…)` name (T1: names carry a LOCK-ID PREFIX, and
 *   combined names like "A2.1/H5" or "A3.1 (F4)" are normal). A `-` before
 *   the id does NOT count: `T2-C5` is a golden-list number from docs/12's
 *   T2 groups, not lock C5.
 *
 * Plain Node, no dependencies, deterministic — like
 * packages/engine/tests/run-fuzz.mjs.
 */

/* global console, process */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TEST_DIRS = [
  join(ROOT, "packages", "engine", "tests"),
  join(ROOT, "apps", "web", "tests"),
];

/**
 * Locks that CANNOT have a test of their own, each with the reason. This
 * list is the only place a lock may be skipped, and every entry must say
 * why — an empty reason is not allowed (checked below).
 */
const EXCLUDED = {
  A3: "meta-lock: the FORMAT every verb contract is written in (5 questions), not behaviour. Its content is A3.1-A3.8, which are all tested.",
  "A2.2":
    "type-shape lock (Clip / TextClip fields incl. BC.1's lineage). Enforced by the compiler on every build (CI step 1) and exercised through every verb, diff and merge test.",
  "A2.3":
    "type-shape lock (Track / Timeline). Its RUNTIME half is the invariant list, which invariants.test.ts covers under B2.3 ('one list, both doors').",
  "BC.6":
    "a documentation wording fix (docs/07 5.3 scope-tag). The lock itself records 'numbers/design/UI unchanged' — there is no behaviour to test.",
  C5: "schemaVersion was CUT entirely (OUT, documented). The absence of a concept cannot be tested; what replaced it (no version column on snapshots) is asserted by C3's schema tests.",
};

// ---------------------------------------------------------------------------

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

/** docs/11: every locked outcome starts a list item with `- **<ID>`. */
function lldLockIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/^- \*\*([A-Z]{1,2}\d*(?:\.\d+)?)\b/gm)) {
    ids.add(match[1]);
  }
  return ids;
}

/** docs/12: the H-group list items, and the G-group inside the F11 block. */
function planLockIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/^- \*\*(H\d+)\b/gm)) ids.add(match[1]);
  for (const match of text.matchAll(/^\s*(G[1-9]) /gm)) ids.add(match[1]);
  return ids;
}

function testNames() {
  const names = [];
  for (const dir of TEST_DIRS) {
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      const pattern =
        /\b(?:describe|it|test)(?:\.each\([\s\S]*?\))?\s*\(\s*"((?:[^"\\]|\\.)*)"/g;
      for (const match of source.matchAll(pattern)) {
        names.push({ file, name: match[1] });
      }
    }
  }
  return names;
}

function isCovered(id, names) {
  // Preceded by nothing, whitespace, `(` `/` `+` or `,`; followed by
  // anything that is not a digit or a dot (so `A3` never matches `A3.1`).
  const escaped = id.replace(/\./g, "\\.");
  const pattern = new RegExp(`(^|[\\s(/+,])${escaped}([^0-9.]|$)`);
  return names.some((entry) => pattern.test(entry.name));
}

function main() {
  for (const [id, reason] of Object.entries(EXCLUDED)) {
    if (!reason || reason.length < 20) {
      console.error(`lock-id gap-check: exclusion "${id}" has no real reason`);
      process.exit(2);
    }
  }

  const ids = [
    ...lldLockIds(read("docs/11-lld-checklist.md")),
    ...planLockIds(read("docs/12-test-benchmark-plan.md")),
  ].sort();
  const names = testNames();

  const missing = [];
  for (const id of ids) {
    if (id in EXCLUDED) continue;
    if (!isCovered(id, names)) missing.push(id);
  }

  const inScope = ids.length - Object.keys(EXCLUDED).length;
  console.log(
    `lock-id gap-check: ${ids.length} lock ids in docs/11 + docs/12, ` +
      `${Object.keys(EXCLUDED).length} excluded with a reason, ` +
      `${inScope} in scope, checked against ${names.length} test names.`,
  );

  if (missing.length > 0) {
    for (const id of missing) console.error(`${id} has no test`);
    console.error(
      `lock-id gap-check FAILED: ${missing.length} implemented lock(s) without a test.`,
    );
    process.exit(1);
  }

  console.log(
    "lock-id gap-check OK: every in-scope lock has at least one test.",
  );
}

main();
