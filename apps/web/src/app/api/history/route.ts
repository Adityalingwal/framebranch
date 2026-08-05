/**
 * GET /api/history — docs/11 C4 (2), a READ door: no ticket, no writes.
 *
 * data: { commits: [{ commitId, name, actor, createdAt, parents,
 *                     importWarnings }] }
 *
 * `actor` is what drives the 👤 / 🤖 badges. `importWarnings` is F7: it is
 * how #17's itemized skipped-list survives a refresh — the list is not
 * kept in the browser, it lives on the import commit.
 *
 * Order: newest first (that is the direction a history panel reads), with
 * the commit id as a deterministic tie-break.
 */

import { desc, eq } from "drizzle-orm";

import { commits } from "../../../db/schema";
import { handleRequest } from "../../../server/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const rows = await db
      .select()
      .from(commits)
      .where(eq(commits.projectId, project.id))
      .orderBy(desc(commits.createdAt), desc(commits.id));

    return {
      commits: rows.map((row) => ({
        commitId: row.id,
        name: row.name,
        actor: row.actor,
        createdAt: row.createdAt.toISOString(),
        // parent2_id is non-null only on merge commits (C3), so a normal
        // commit reports one parent and the root reports none.
        parents: [row.parentId, row.parent2Id].filter(
          (id): id is string => id !== null,
        ),
        importWarnings: row.importWarnings,
      })),
    };
  });
}
