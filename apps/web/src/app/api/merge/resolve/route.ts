/**
 * POST /api/merge/resolve — docs/11 C4 (4) + F6, the EDIT category
 * (docs/09 #5): it writes into the merge DRAFT, never into history.
 *
 * req:  { attemptId, conflictId, choice, ticket }
 * data: conflicts remain → { counts, conflicts }   (fresh recompute)
 *       last one answered → { done: true, mergeCommitId }
 *
 * B3.3: a click saves an answer in the parchi (`choices`) and the engine
 * recomputes the WHOLE merge from base/ours/theirs + every saved answer.
 * The draft is never edited in place, so click order cannot change the
 * result and a crash cannot leave a half-written draft.
 *
 * The three timelines are re-materialized from the heads the ATTEMPT stored,
 * never from the branches' current heads: the attempt is pinned to the
 * history it started from, which is what makes the finalize CAS meaningful.
 */

import { applyChoice } from "@framebranch/engine";
import type { MergeChoices } from "@framebranch/engine";

import { mergeAttempts } from "../../../../db/schema";
import { ApiError } from "../../../../server/envelope";
import { handleRequest, readBody } from "../../../../server/handler";
import {
  finalizeMerge,
  loadMergeAttempt,
  loadMergeSides,
} from "../../../../server/merge";
import { mergeResolveBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, mergeResolveBodySchema);

    return runWithTicket(
      db,
      project.id,
      "merge-resolve",
      body.ticket,
      async (tx) => {
        const attempt = await loadMergeAttempt(tx, project.id, body.attemptId);
        const sides = await loadMergeSides(
          tx,
          project.id,
          attempt.headInto,
          attempt.headFrom,
        );

        const result = applyChoice({
          base: sides.base,
          ours: sides.ours,
          theirs: sides.theirs,
          choices: attempt.choices as MergeChoices,
          conflictId: body.conflictId,
          choice: body.choice,
        });
        if (!result.ok) {
          // C7 owns the rules this reports: an unknown/answered conflict, a
          // choice the bucket does not offer, and replacing a permanent
          // answer with a DIFFERENT one. Re-answering with the SAME choice
          // is a normal success there, so it is a normal success here.
          throw new ApiError("E_MERGE_PRECONDITION", result.error.message);
        }

        await tx
          .update(mergeAttempts)
          .set({
            choices: result.choices,
            draftTimeline: result.timeline,
            conflicts: result.conflicts,
          })
          .where(eq(mergeAttempts.id, attempt.id));

        if (result.conflicts.length > 0) {
          // B3.4's honest count: `counts` includes any conflict that only
          // appeared because this answer put a held-back clip on the
          // timeline for the first time.
          return { counts: result.counts, conflicts: result.conflicts };
        }

        // Last conflict answered → finalize automatically, in this same
        // transaction (docs/09 6d).
        return finalizeMerge({
          tx,
          projectId: project.id,
          intoBranchId: attempt.branchInto,
          fromBranchId: attempt.branchFrom,
          headInto: attempt.headInto,
          headFrom: attempt.headFrom,
          sides,
          choices: result.choices,
          attemptId: attempt.id,
        });
      },
    );
  });
}
