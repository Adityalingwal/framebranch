/**
 * POST /api/merge/resolve — writes into the merge draft, never into history.
 *
 * A click saves an answer in the draft's choices and the engine recomputes
 * the whole merge from base + both sides + every saved answer. The draft is
 * never edited in place — click order cannot change the result.
 *
 * The three timelines come from the heads the attempt stored, never from
 * the branches' current heads, making the finalize CAS meaningful.
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
          // The engine reports: unknown/answered conflict, invalid choice
          // for the bucket, or replacing a permanent answer. Re-answering
          // with the same choice IS valid — identical choice = no-change.
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
          return { counts: result.counts, conflicts: result.conflicts };
        }

        // Last conflict answered → finalize automatically in this transaction.
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
