/**
 * GET /api/diff — docs/11 C4 (2), a READ door: no ticket, no seal, no
 * writes (docs/09 #5's READ category).
 *
 * req:  ?from=<commitId>&to=<commitId>  + the capability-token cookie
 * data: the engine's `computeDiff` result VERBATIM — `{ entries, sentences }`,
 *       strictly 1:1 (C1). It is not reshaped, re-worded, re-sorted or
 *       filtered here: the 15 classify rules, their English templates and
 *       their order are the engine's lock, and a second opinion in the
 *       server would be a second implementation of C1.
 *
 * Both commits are looked up project-scoped first, so a commit id belonging
 * to another project is NOT FOUND rather than readable (HLD #14, test G5's
 * rule applied to this door).
 *
 * The parameter names `from` and `to` are this endpoint's own choice — C4
 * only says "do commits ke beech". They read in the same direction as the
 * sentences ("what changed going from A to B") and match POST branch/switch's
 * existing `from`/`to` vocabulary.
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
