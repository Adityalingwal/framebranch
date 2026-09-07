/**
 * POST /api/commit — the Mark door (B4-1: "Mark version"). Turns pending
 * ops into ops rows under the user's name and restarts the working record
 * on the new card.
 *
 * C2: the name is REQUIRED — missing or whitespace-only → 400
 * E_NAME_REQUIRED, checked before anything else (the UI keeps the button
 * disabled while empty; this is the safety net). No `Version N` fallback
 * exists any more.
 *
 * If nothing is pending, the branch's current head is returned unchanged —
 * an "already saved" no-op, not an error (E1 mechanics land in B1).
 */

import { and, eq } from "drizzle-orm";

import { commits } from "../../../db/schema";
import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import { commitBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, commitBodySchema);

    const name = body.name?.trim() ?? "";
    if (name.length === 0) {
      throw new ApiError("E_NAME_REQUIRED", "a version needs a name");
    }

    return runWithTicket(db, project.id, "commit", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      if (!isDirty(view)) {
        const head = await tx
          .select({ id: commits.id, name: commits.name })
          .from(commits)
          .where(
            and(
              eq(commits.id, view.branch.headCommitId),
              eq(commits.projectId, project.id),
            ),
          )
          .limit(1);
        return { commitId: head[0].id, name: head[0].name };
      }

      return createCommit({
        tx,
        projectId: project.id,
        branch: view.branch,
        working: view.working,
        timeline: view.timeline,
        name,
        actor: "user",
        kind: "mark",
        actorName: editorName,
      });
    });
  });
}
