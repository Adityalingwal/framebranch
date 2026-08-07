/**
 * GET /api/history — read-only. Returns commits newest-first with actor for
 * 👤/🤖 badges, optional importWarnings, and parents list (single parent for
 * normal commits, two for merge commits, none for root).
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
