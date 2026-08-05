/**
 * POST /api/merge — docs/11 C4 (4) + F6, a BOUNDARY door.
 *
 * req:  { from, into, ticket }        — `from` is merged INTO `into`
 * data: zero conflicts → { done: true, mergeCommitId }
 *       conflicts      → { attemptId, conflicts, counts }
 *
 * Why BOTH branches are sealed when dirty: the merge is computed from the
 * two branches' COMMITTED heads, and `merge_attempts` stores those two head
 * ids for the finalize CAS (docs/09 #8). Unsealed pending work on either
 * side would silently be absent from the merge — precisely what the boundary
 * auto-seal rule (docs/09 Item 6a(4), which names merge as one of the six)
 * exists to prevent.
 *
 * Zero conflicts finalize immediately, in this same transaction: the
 * two-phase flow's second phase is empty, and docs/09 6d locks that the
 * merge commit appears automatically with no extra "Confirm merge?" step.
 */

import { startMerge } from "@framebranch/engine";

import { mergeAttempts } from "../../../db/schema";
import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import {
  MERGE_ATTEMPT_OPEN,
  finalizeMerge,
  loadMergeSides,
} from "../../../server/merge";
import { SEAL_BEFORE_MERGE } from "../../../server/naming";
import { mergeBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, mergeBodySchema);

    return runWithTicket(db, project.id, "merge", body.ticket, async (tx) => {
      // Two branches are locked here. They are locked in a deterministic
      // (name) order so that two merges running in opposite directions
      // queue behind each other instead of deadlocking.
      const order = [body.into, body.from].sort();
      for (const name of order) {
        const view = await loadBranchView(tx, project.id, name, true);
        if (isDirty(view)) {
          await createCommit({
            tx,
            projectId: project.id,
            branch: view.branch,
            working: view.working,
            timeline: view.timeline,
            name: SEAL_BEFORE_MERGE,
            actor: "user",
          });
        }
      }

      // Re-read AFTER the seals: the rows loaded above are stale the moment
      // a seal moves a head.
      const into = await loadBranchView(tx, project.id, body.into, true);
      const from = await loadBranchView(tx, project.id, body.from, true);
      const headInto = into.branch.headCommitId;
      const headFrom = from.branch.headCommitId;

      const sides = await loadMergeSides(tx, project.id, headInto, headFrom);
      // C7: `ours` = the branch merged INTO, `theirs` = the branch merged FROM.
      const result = startMerge({
        base: sides.base,
        ours: sides.ours,
        theirs: sides.theirs,
      });
      if (!result.ok) {
        // C7 locks E_MERGE_PRECONDITION as startMerge's only failure.
        throw new ApiError("E_MERGE_PRECONDITION", result.error.message);
      }

      if (result.conflicts.length === 0) {
        // Finalize now — no draft row is created, so none is left behind.
        return finalizeMerge({
          tx,
          projectId: project.id,
          intoBranchId: into.branch.id,
          fromBranchId: from.branch.id,
          headInto,
          headFrom,
          sides,
          choices: result.choices,
        });
      }

      const [attempt] = await tx
        .insert(mergeAttempts)
        .values({
          projectId: project.id,
          branchInto: into.branch.id,
          branchFrom: from.branch.id,
          headInto,
          headFrom,
          // B3.3: the safe materialized draft. Unanswered conflicts'
          // participants are deliberately NOT in it.
          draftTimeline: result.timeline,
          conflicts: result.conflicts,
          // The parchi starts as the engine gave it (empty at start).
          choices: result.choices,
          status: MERGE_ATTEMPT_OPEN,
        })
        .returning({ id: mergeAttempts.id });

      return {
        attemptId: attempt.id,
        conflicts: result.conflicts,
        counts: result.counts,
      };
    });
  });
}
