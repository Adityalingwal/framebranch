/**
 * types.ts — the small server-side shapes that the DB layer and the route
 * layer share. Domain types come from the engine's public index.
 */

import type { Command } from "@framebranch/engine";

export type Actor = "user" | "agent";

/**
 * B4 — the seven card kinds. Every createCommit caller names one; the TS
 * union makes forgetting one a compile error, never a runtime default.
 */
export const COMMIT_KINDS = [
  "mark",
  "auto",
  "agent-run",
  "bring-in",
  "restore",
  "seed",
  "import",
] as const;
export type CommitKind = (typeof COMMIT_KINDS)[number];

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
  | "commit"
  | "merge"
  | "merge-resolve"
  | "merge-abort"
  | "import"
  | "export"
  | "agent-run"
  | "branch-create"
  | "branch-switch"
  /** F3(4) — one resource (`/api/branch/ready`), two verbs (B4b lock (1)). */
  | "ready-set"
  | "ready-clear"
  | "demo-reset"
  | "project-new"
  | "restore";
