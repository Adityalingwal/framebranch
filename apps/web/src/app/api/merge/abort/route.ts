/**
 * POST /api/merge/abort — discard category. Deletes the draft row only.
 *
 * No commit is created. Both branches' timelines are untouched — a merge
 * only writes to merge_attempts until finalize.
 */

import { and, eq } from "drizzle-orm";

import { mergeAttempts } from "../../../../db/schema";
import { handleRequest, readBody } from "../../../../server/handler";
import { loadMergeAttempt } from "../../../../server/merge";
import { mergeAbortBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, mergeAbortBodySchema);

    return runWithTicket(
      db,
      project.id,
      "merge-abort",
      body.ticket,
      async (tx) => {
        // Project-scoped and locked; a draft that is not there is
        // E_MERGE_PRECONDITION (see server/merge.ts — no "not found" code
        // for attempts exists and none was invented).
        const attempt = await loadMergeAttempt(tx, project.id, body.attemptId);

        await tx
          .delete(mergeAttempts)
          .where(
            and(
              eq(mergeAttempts.id, attempt.id),
              eq(mergeAttempts.projectId, project.id),
            ),
          );

        return { aborted: true as const };
      },
    );
  });
}
