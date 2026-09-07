/**
 * events.ts — J1's project event feed, write side only (B0).
 *
 * `appendEvent` is called INSIDE the transaction that makes the change it
 * describes, so a poller (B4's `/api/sync`) can never see an event whose
 * change was rolled back, nor a change without its event. Nothing reads
 * the table in B0.
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
  | "import";

export async function appendEvent(
  tx: Tx,
  projectId: string,
  kind: ProjectEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.insert(projectEvents).values({ projectId, kind, payload });
}
