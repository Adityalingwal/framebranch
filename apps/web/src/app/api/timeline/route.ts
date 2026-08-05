/**
 * GET /api/timeline — docs/11 C4 (2), a READ door: no ticket, no writes.
 *
 * req:  ?branch=<name>  + the capability-token cookie
 * data: { timeline, workingRev, pendingCount }
 *
 * The timeline returned is the base commit's state PLUS `pending_ops`
 * replayed on top — i.e. exactly what the user is looking at, not the last
 * saved version. `pendingCount` is what the "N changes" chip shows.
 */

import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadBranchView } from "../../../server/branches";

export const runtime = "nodejs"; // transactions need it (docs/09 Item 4a)
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
