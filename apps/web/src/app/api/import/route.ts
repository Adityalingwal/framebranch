/**
 * POST /api/import — a boundary door.
 *
 * On success the commit carries a forced full snapshot, no ops rows, and
 * import_warnings from the engine as structured objects. The engine takes
 * `unknown` and never throws — failures propagate the engine's own code.
 *
 * Import is a fresh start: new ids, nothing matched against previous state.
 *
 * A re-import must not change the project's frame rate. The project's
 * existing rate is passed to the engine as targetRate — older commits stay
 * interpretable at the same rate they were written in.
 */

import { importOtio } from "@framebranch/engine";

import { isDirty, loadBranchView } from "../../../server/branches";
import { createCommit } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import {
  IMPORTED_TIMELINE_COMMIT_NAME,
  SEAL_BEFORE_IMPORT,
} from "../../../server/naming";
import { importBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, importBodySchema);

    return runWithTicket(db, project.id, "import", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      const imported = importOtio(body.otioJson, project.projectRate);
      if (!imported.ok) {
        // Nothing is written: this throw rolls the transaction back, seal
        // included.
        throw new ApiError(imported.error.code, imported.error.message);
      }

      if (isDirty(view)) {
        await createCommit({
          tx,
          projectId: project.id,
          branch: view.branch,
          working: view.working,
          timeline: view.timeline,
          name: SEAL_BEFORE_IMPORT,
          actor: "user",
        });
      }

      // Re-read after the seal.
      const fresh = await loadBranchView(tx, project.id, body.branch, true);

      const commit = await createCommit({
        tx,
        projectId: project.id,
        branch: fresh.branch,
        working: fresh.working, // clean → no ops rows
        timeline: imported.timeline,
        name: IMPORTED_TIMELINE_COMMIT_NAME,
        actor: "user",
        forceSnapshot: true,
        importWarnings: imported.warnings,
      });

      return { commitId: commit.commitId, skippedItems: imported.warnings };
    });
  });
}
