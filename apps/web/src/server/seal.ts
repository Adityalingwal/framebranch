/**
 * seal.ts — the boundary auto-seal (B4 / C1(2)), in ONE place.
 *
 * Every boundary door (branch create/switch, merge start, restore, agent
 * run, import, export) used to seal a dirty working area under a fixed
 * `Auto — before …` name. Now:
 *  - the card is `kind: "auto"` and named by WHAT CHANGED — the shared
 *    presenter's summary (`3 clips moved, 1 trimmed`), never the mechanics;
 *  - an auto card with ZERO real changes is never created: `isDirty` stays
 *    the cheap pre-check, then the presenter counts rows against the base
 *    commit; 0 rows (pending ops that cancel out) → the working record is
 *    fast-forwarded (pending emptied, base and working_rev kept) so the
 *    branch is clean without a card. Nothing is lost: 0 rows ⇔ 0 engine
 *    entries ⇔ the working timeline equals the base commit's.
 */

import type { BranchView } from "./branches";
import { isDirty } from "./branches";
import { createCommit } from "./commits";
import { presentDiff } from "./diff-rows";
import { loadCommitTimeline } from "./timeline";
import type { Tx } from "./tx";
import { and, eq } from "drizzle-orm";

import { workingState } from "../db/schema";

export type SealResult =
  | { sealed: true; commitId: string; name: string }
  | { sealed: false; reason: "clean" | "no-changes" };

export async function sealIfDirty(
  tx: Tx,
  projectId: string,
  view: BranchView,
  actorName: string,
): Promise<SealResult> {
  if (!isDirty(view)) return { sealed: false, reason: "clean" };

  const base = await loadCommitTimeline(tx, projectId, view.working.baseCommitId);
  const presented = presentDiff(base, view.timeline);

  if (presented.count === 0) {
    // Cancelled-out edits: clear the pending list, keep base + working_rev
    // (monotonic — never reset), write no card.
    await tx
      .update(workingState)
      .set({ pendingOps: [] })
      .where(
        and(
          eq(workingState.branchId, view.branch.id),
          eq(workingState.projectId, projectId),
        ),
      );
    return { sealed: false, reason: "no-changes" };
  }

  const commit = await createCommit({
    tx,
    projectId,
    branch: view.branch,
    working: view.working,
    timeline: view.timeline,
    name: presented.summaryName,
    actor: "user",
    kind: "auto",
    actorName,
  });
  return { sealed: true, commitId: commit.commitId, name: commit.name };
}
