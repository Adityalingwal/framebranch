/**
 * POST /api/commit — docs/11 C4 (4) + F6, the COMMIT door.
 *
 * req:  { branch, name?, ticket }
 * data: { commitId, name }
 *
 * `pending_ops` become `ops` rows with `seq` preserving their order, and
 * the working record restarts on the new commit (docs/09 triage #2). The
 * snapshot cadence and the head CAS live in server/commits.ts.
 *
 * Nothing pending: this returns the branch's CURRENT head unchanged and
 * creates no commit. docs/09 triage #7 names exactly this case — a second
 * tab pressing Save after the first one already saved is an "already
 * saved" no-op, not an error (and the C4 error list has no code for
 * "nothing to save", deliberately).
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

      // Deterministic template only — never AI (docs/09 Item 6a(5)).
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
