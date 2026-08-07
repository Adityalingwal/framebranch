/**
 * POST /api/restore — a boundary door. Creates a new commit whose content is
 * an old version. History is never rewritten — restoring moves forward and
 * is itself undoable. The commit carries a full snapshot.
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

      // Project-scoped, checked before the seal: an unknown commit must
      // not leave an auto-seal behind.
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
        working: fresh.working, // clean now → no ops rows
        timeline: restored,
        name: restoreCommitName(target.name),
        actor: "user",
        forceSnapshot: true,
      });
    });
  });
}
