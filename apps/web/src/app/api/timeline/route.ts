/**
 * GET /api/timeline — read-only, no ticket, no writes.
 *
 * Returns the base commit's state with pending ops replayed on top — the
 * live working view, not the last saved version.
 */

import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadBranchView } from "../../../server/branches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const branch = requiredQuery(request, "branch");
    return db.transaction(async (tx) => {
      const view = await loadBranchView(tx, project.id, branch);
      return {
        timeline: view.timeline,
        workingRev: view.working.workingRev,
        pendingCount: view.pending.length,
      };
    });
  });
}
