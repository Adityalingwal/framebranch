/**
 * POST /api/demo/reset — docs/11 C4 (4) + F6, the DISCARD category
 * (docs/09 #5). No commit is created: the whole intent is to throw the
 * current state away.
 *
 * req:  { ticket }
 * data: { done: true }
 *
 * This project's state is reset IN PLACE: its rows in branches / commits /
 * ops / snapshots / working_state / merge_attempts are deleted and the
 * project is re-seeded from `demo.otio` through the SAME function the
 * first-visit bootstrap uses (server/project.ts `seedProjectFromDemo`) —
 * including `project_rate` refreshed from the imported OTIO (A1.2).
 *
 * What deliberately SURVIVES, and why:
 *  - the `projects` row, its `owner_token` and therefore the cookie: docs/09
 *    #5 asks for a fresh project STATE, not a new identity;
 *  - the `tickets` rows: every other table hangs off `projects` with ON
 *    DELETE CASCADE, so deleting the project row would take the ticket row
 *    that `runWithTicket` is about to write for THIS call with it — and the
 *    endpoint could then never be idempotent, which is locked for every
 *    mutating endpoint (docs/09 #16).
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
        // Deleted explicitly and in FK order (children first) rather than
        // relying on cascades, so the statement list reads as exactly what
        // #5 promises. Every WHERE is project-scoped (HLD #14 + F1).
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
