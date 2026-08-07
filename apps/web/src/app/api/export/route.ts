/**
 * POST /api/export — a boundary door. May create a commit (auto-seal) if the
 * branch is dirty, tying the exported file to an exact version.
 *
 * mediaWarnings is omitted — V1 media are deployment URL fixtures with no
 * runtime resolution check, so there's no honest signal to fill the field.
 * Export always succeeds (OTIO carries pointers, never bytes).
 */

import { exportOtio } from "@framebranch/engine";

import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit, loadCommitRow } from "../../../server/commits";
import { handleRequest, readBody } from "../../../server/handler";
import { SEAL_BEFORE_EXPORT } from "../../../server/naming";
import { exportBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, exportBodySchema);

    return runWithTicket(db, project.id, "export", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      if (isDirty(view)) {
        await createCommit({
          tx,
          projectId: project.id,
          branch: view.branch,
          working: view.working,
          timeline: view.timeline,
          name: SEAL_BEFORE_EXPORT,
          actor: "user",
        });
      }

      // Re-read after the seal. The branch is clean now, so its working
      // timeline IS its head commit's timeline — the version being exported.
      const fresh = await loadBranchView(tx, project.id, body.branch, true);
      const head = await loadCommitRow(
        tx,
        project.id,
        fresh.branch.headCommitId,
      );

      return {
        otioJson: exportOtio(fresh.timeline),
        commitId: head.id,
        name: head.name,
      };
    });
  });
}
