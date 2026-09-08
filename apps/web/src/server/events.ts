/**
 * events.ts — J1's project event feed.
 *
 * `appendEvent` is called INSIDE the transaction that makes the change it
 * describes, so a poller can never see an event whose change was rolled
 * back, nor a change without its event.
 *
 * Read side = `POST /api/sync` (B4b): a tab hands in the last id it saw and
 * gets everything after it. Nothing else reads this table.
 */

import { projectEvents } from "../db/schema";
import type { Tx } from "./tx";

/** The event vocabulary. One entry per transaction kind that appends. */
export type ProjectEventKind =
  | "commit-created"
  | "branch-created"
  | "branch-switched"
  | "restore"
  | "merge-finalized"
  | "import"
  /** F3(4) — a cut was marked / un-marked "Ready for main" (B4b). */
  | "ready-set"
  | "ready-cleared"
  /**
   * J1 — one edit landed on a cut's working area (B4b). Without it
   * `Edited since ready` would reach nobody: `POST /api/ops` is the ONLY
   * thing that moves `working_rev`, and no other event follows it.
   */
  | "edit";

export async function appendEvent(
  tx: Tx,
  projectId: string,
  kind: ProjectEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(projectEvents).values({ projectId, kind, payload });
}
