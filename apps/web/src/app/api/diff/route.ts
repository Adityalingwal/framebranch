/**
 * GET /api/diff — read-only. Returns the engine's computeDiff result
 * verbatim (entries + sentences, strictly 1:1). Both commits are project-
 * scoped — a commit from another project is not found.
 */

import { computeDiff } from "@framebranch/engine";

import { loadCommitRow } from "../../../server/commits";
import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadCommitTimeline } from "../../../server/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const from = requiredQuery(request, "from");
    const to = requiredQuery(request, "to");

    return db.transaction(async (tx) => {
      await loadCommitRow(tx, project.id, from);
      await loadCommitRow(tx, project.id, to);

      const a = await loadCommitTimeline(tx, project.id, from);
      const b = await loadCommitTimeline(tx, project.id, to);
      return computeDiff(a, b);
    });
  });
}
