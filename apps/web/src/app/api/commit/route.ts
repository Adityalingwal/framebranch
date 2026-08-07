/**
 * POST /api/commit — the commit door. Turns pending ops into ops rows and
 * restarts the working record on the new commit. If nothing is pending,
 * returns the branch's current head unchanged — an "already saved" no-op,
 * not an error.
 */

import { and, eq } from "drizzle-orm";

import { commits } from "../../../db/schema";
import { isDirty, loadBranchView } from "../../../server/branches";
import { countCommits, createCommit } from "../../../server/commits";
import { handleRequest, readBody } from "../../../server/handler";
import { versionName } from "../../../server/naming";
import { commitBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, commitBodySchema);

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

      // Commit names are deterministic templates only, never AI.
      const name =
        body.name ?? versionName((await countCommits(tx, project.id)) + 1);

      return createCommit({
        tx,
        projectId: project.id,
        branch: view.branch,
        working: view.working,
        timeline: view.timeline,
        name,
        actor: "user",
      });
    });
  });
}
