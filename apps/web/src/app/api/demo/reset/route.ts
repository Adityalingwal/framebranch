/**
 * POST /api/demo/reset — discard category. Resets this project's state to
 * the demo fixture without deleting the project row, owner token, or cookie.
 *
 * Tickets survive so the endpoint stays idempotent — deleting the project
 * row would cascade to the ticket row runWithTicket is about to write.
 */

import { eq } from "drizzle-orm";

import {
  branches,
  commits,
  mergeAttempts,
  ops,
  snapshots,
  workingState,
} from "../../../../db/schema";
import { handleRequest, readBody } from "../../../../server/handler";
import { seedProjectFromDemo } from "../../../../server/project";
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
        // Explicit deletes in FK order (children first). Every WHERE
        // is project-scoped.
        await tx
          .delete(mergeAttempts)
          .where(eq(mergeAttempts.projectId, project.id));
        await tx
          .delete(workingState)
          .where(eq(workingState.projectId, project.id));
        await tx.delete(branches).where(eq(branches.projectId, project.id));
        await tx.delete(ops).where(eq(ops.projectId, project.id));
        await tx.delete(snapshots).where(eq(snapshots.projectId, project.id));
        await tx.delete(commits).where(eq(commits.projectId, project.id));

        await seedProjectFromDemo(tx, project.id);

        return { done: true as const };
      },
    );
  });
}
