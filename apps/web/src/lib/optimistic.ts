/**
 * optimistic.ts — the ONE opt-in list + the ONE computation call site for
 * the hybrid optimistic wrapper (brief §4, docs/07 M8 lock 5).
 *
 * Framework-free on purpose (no React import here): the locked test —
 * "for the same command, the optimistic result equals the server result" —
 * is written as a plain unit test against this file (tests/optimistic.test.ts),
 * no browser, no React, no DOM.
 *
 * Robustness rule (a): default = server-first. `OPTIMISTIC_VERBS` is the
 * single opt-in list; a verb absent from it silently falls back to
 * server-first (the mutation still succeeds — it just doesn't jump the gun
 * on screen). Forgetting to add a new verb here can never make it dangerous.
 *
 * Robustness rule (b): the optimistic result comes from the engine only.
 * `computeOptimisticResult` is a one-line pass-through to `applyCommand` —
 * the exact same pure function `apps/web/src/app/api/ops/route.ts` calls on
 * the server. There is no hand-written shortcut anywhere in this file.
 *
 * `addClip` is deliberately NOT in the opt-in list. The engine mints a new
 * clip's id from the op's id (`minterFor(opId)` in server/timeline.ts), and
 * that op id is a `randomUUID()` the SERVER generates after the request
 * arrives — the browser cannot predict it. An optimistic add would show a
 * clip under a client-guessed id that the server's real id will never match,
 * which is exactly the "client guessed, server did something else" failure
 * mode rule (b) exists to rule out. addClip is out of scope for M8b anyway
 * (brief §5: "not needed for the 9-step demo; build only if it costs
 * nothing") — it was not built at all (see findings).
 */

import { applyCommand } from "@framebranch/engine";
import type { ApplyResult, Command, Timeline } from "@framebranch/engine";

export const OPTIMISTIC_VERBS: ReadonlySet<Command["op"]> = new Set([
  "move",
  "trim",
  "slip",
  "split",
  "deleteClip",
  "rippleDelete",
  "propertyChange",
]);

export function isOptimisticVerb(op: Command["op"]): boolean {
  return OPTIMISTIC_VERBS.has(op);
}

/** Rule (b)'s single call site. */
export function computeOptimisticResult(
  timeline: Timeline,
  command: Command,
): ApplyResult {
  return applyCommand(timeline, command);
}
