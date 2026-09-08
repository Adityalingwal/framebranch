/**
 * POST /api/demo/reset — thin alias of `POST /api/project/new` for the
 * default preset. Same code path: resetProjectToPreset. API-only since
 * B4a: the rail's "Reset demo" became "New project…", whose first row IS
 * the default preset, so nothing in the interface calls this any more.
 *
 * Tickets survive so the endpoint stays idempotent — deleting the project
 * row would cascade to the ticket row runWithTicket is about to write.
 */

import { handleRequest, readBody } from "../../../../server/handler";
import { DEFAULT_PRESET_ID } from "../../../../server/presets";
import { resetProjectToPreset } from "../../../../server/project";
import { demoResetBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, demoResetBodySchema);

    return runWithTicket(
      db,
      project.id,
      "demo-reset",
      body.ticket,
      async (tx) => {
        await resetProjectToPreset(tx, project.id, DEFAULT_PRESET_ID);
        return { done: true as const };
      },
    );
  });
}
