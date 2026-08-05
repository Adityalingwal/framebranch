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

/** C3's `tickets.endpoint` values — the locked list, M7a's subset used here. */
export type TicketEndpoint =
  "ops" | "commit" | "branch-create" | "branch-switch";
