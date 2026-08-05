/**
 * POST /api/restore — docs/11 C4 (4) + F6 + F5(a), a BOUNDARY door.
 *
 * req:  { branch, commitId, ticket }
 * data: { commitId, name }   — the NEW restore commit, not the one restored from
 *
 * docs/09 Item 6c: restore is a NEW commit whose CONTENT is an old version.
 * History is never rewritten and nothing is deleted — restore moves forward,
 * so restoring is itself undoable.
 *
 * The commit carries a forced full snapshot (Q1): "become version X" is not
 * a verb, so there are no ops that could express this commit, and a full
 * snapshot is its only honest representation.
 */

import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit, loadCommitRow } from "../../../server/commits";
import { handleRequest, readBody } from "../../../server/handler";
import { SEAL_BEFORE_RESTORE, restoreCommitName } from "../../../server/naming";
import { restoreBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";
import { loadCommitTimeline } from "../../../server/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, restoreBodySchema);

    return runWithTicket(db, project.id, "restore", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      // Project-scoped, and checked BEFORE the seal: an unknown version must
      // not leave an auto-seal behind, and a commit from another project is
      // simply not there (HLD #14).
      const target = await loadCommitRow(tx, project.id, body.commitId);
      const restored = await loadCommitTimeline(tx, project.id, target.id);

      if (isDirty(view)) {
        await createCommit({
          tx,
          projectId: project.id,
          branch: view.branch,
          working: view.working,
          timeline: view.timeline,
          name: SEAL_BEFORE_RESTORE,
          actor: "user",
        });
      }

      // Re-read after the seal: the branch head and the working record moved.
      const fresh = await loadBranchView(tx, project.id, body.branch, true);

      return createCommit({
        tx,
        projectId: project.id,
        branch: fresh.branch,
        working: fresh.working, // clean now → no ops rows (Q1)
        timeline: restored,
        name: restoreCommitName(target.name),
        actor: "user",
        forceSnapshot: true,
      });
    });
  });
}
