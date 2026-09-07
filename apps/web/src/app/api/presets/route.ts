/**
 * GET /api/presets — read-only. The preset registry for the "New project"
 * picker (copy #46-#47): id, display name, clip count and 4-part duration.
 */

import { handleRequest } from "../../../server/handler";
import { PRESETS, presetSummary } from "../../../server/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async () => ({
    presets: PRESETS.map(presetSummary),
  }));
}
