/**
 * POST /api/project/new { preset } — "New project" (G1): this project's
 * state is wiped and re-seeded from the named preset, in place (project
 * row, owner token and cookie stay). Returns the fresh working view of
 * `main` so the client can paint it without a second round-trip.
 *
 * An unknown preset is E_BAD_REQUEST and deletes nothing.
 */

import { loadBranchView } from "../../../../server/branches";
import { handleRequest, readBody } from "../../../../server/handler";
import { resetProjectToPreset } from "../../../../server/project";
import { projectNewBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, projectNewBodySchema);

    return runWithTicket(
      db,
      project.id,
      "project-new",
      body.ticket,
      async (tx) => {
        const seeded = await resetProjectToPreset(tx, project.id, body.preset);
        const view = await loadBranchView(tx, project.id, "main");
        return {
          preset: { id: seeded.preset.id, name: seeded.preset.name },
          branch: "main",
          head: seeded.commitId,
          timeline: view.timeline,
          workingRev: view.working.workingRev,
          pendingCount: view.pending.length,
        };
      },
    );
  });
}
