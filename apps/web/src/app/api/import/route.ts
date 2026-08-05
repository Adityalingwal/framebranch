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
 *
 * A1.2/A1.3 read literally would let a re-import overwrite `project_rate`
 * with the new file's own rate, leaving the project's older commits (still
 * in the old rate's frame-numbers) misinterpreted from then on (the M7b
 * findings' witness: 240@24 vs 300@30, same 10s, `GET diff` calls it a
 * 60-frame extension). Fixed here — the project's EXISTING rate is passed
 * to the engine as `targetRate`, so the incoming file lands on it instead
 * of the project ever changing rate after its first import.
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
