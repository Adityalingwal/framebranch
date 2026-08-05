/**
 * POST /api/import — docs/11 C4 (4) + F6 + F5(a), a BOUNDARY door.
 *
 * req:  { branch, otioJson, ticket }
 * data: { commitId, skippedItems }
 *
 * The ENGINE decides what the document means (`importOtio` — O7/H11: it
 * takes `unknown` and never throws). A failure propagates the engine's own
 * code (E_INVALID_OTIO / E_UNSUPPORTED_OTIO_VERSION) and NOTHING is written.
 *
 * On success the commit carries:
 *  - a forced full snapshot (Q1 — an import has no parent, so ops cannot
 *    express it),
 *  - no ops rows,
 *  - `import_warnings` = the engine's structured warnings (O8:
 *    `{code, detail, count}`). F7 is the reason that column exists: it is
 *    how #17's itemized "Skipped: 2 transitions, 1 blur" survives a refresh.
 *    `skippedItems` in the response is that same list.
 *
 * Import is a FRESH START (docs/09 #10): new ids, nothing matched against
 * what was there before. The engine guarantees that; no matching is added.
 */

import { importOtio } from "@framebranch/engine";

import { projects } from "../../../db/schema";
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
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, importBodySchema);

    return runWithTicket(db, project.id, "import", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      const imported = importOtio(body.otioJson);
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

      // A1.2 read literally: the project rate comes from the imported OTIO.
      // ⚠ FLAGGED for owner triage (see the M7b findings): if the new file's
      // rate differs from the project's, the project's older commits keep
      // their own rate and the project holds two rates across its history.
      await tx
        .update(projects)
        .set({ projectRate: imported.timeline.projectRate })
        .where(eq(projects.id, project.id));

      // Re-read after the seal.
      const fresh = await loadBranchView(tx, project.id, body.branch, true);

      const commit = await createCommit({
        tx,
        projectId: project.id,
        branch: fresh.branch,
        working: fresh.working, // clean now → no ops rows (Q1)
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
