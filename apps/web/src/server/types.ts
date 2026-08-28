/**
 * types.ts — the small server-side shapes that the DB layer and the route
 * layer share. Domain types come from the engine's public index.
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
 * The tickets.endpoint vocabulary. Every mutating endpoint has an entry here.
 */
export type TicketEndpoint =
  | "ops"
  | "ops-history"
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
