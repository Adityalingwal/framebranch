/**
 * types.ts — the small server-side shapes that the DB layer and the route
 * layer share. Domain types all come from the engine's public index
 * (docs/11 C7: "apps/web sirf index se import karega").
 */

import type { Command } from "@framebranch/engine";

export type Actor = "user" | "agent";

/**
 * One entry of `working_state.pending_ops` (and, once sealed, one `ops`
 * row). `id` is minted when the edit is accepted and NEVER changes — it is
 * what makes replay deterministic: the engine's id minting for `addClip`
 * is derived from this id (see server/timeline.ts `minterFor`), so
 * replaying the same op list always rebuilds the same clip ids.
 */
export type PendingOp = {
  id: string;
  actor: Actor;
  command: Command;
};

/**
 * C3 (8)'s `tickets.endpoint` vocabulary. C3 lists:
 * ops / commit / merge / merge-resolve / import / export / agent-run /
 * branch-create / branch-switch / demo-reset / restore.
 *
 * ⚠ `merge-abort` is NOT in C3's list, but C4 (4) says every mutating
 * endpoint carries a ticket and merge/abort is a mutating endpoint (the
 * DISCARD category, docs/09 #5). It is added here and REPORTED as a
 * one-word documentation omission for owner triage — not a design change.
 */
export type TicketEndpoint =
  | "ops"
  | "commit"
  | "merge"
  | "merge-resolve"
  | "merge-abort"
  | "import"
  | "export"
  | "agent-run"
  | "branch-create"
  | "branch-switch"
  | "demo-reset"
  | "restore";
