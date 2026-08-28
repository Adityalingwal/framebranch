import { and, eq } from "drizzle-orm";

import { applyCommand } from "@framebranch/engine";

import { workingState } from "../../../../db/schema";
import { loadBranchView } from "../../../../server/branches";
import { ApiError } from "../../../../server/envelope";
import { handleRequest, readBody } from "../../../../server/handler";
import { opsHistoryBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";
import { minterFor } from "../../../../server/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, opsHistoryBodySchema);

    return runWithTicket(
      db,
      project.id,
      "ops-history",
      body.ticket,
      async (tx) => {
        const view = await loadBranchView(tx, project.id, body.branch, true);
        if (view.working.workingRev !== body.workingRev) {
          throw new ApiError(
            "E_STALE_REV",
            `working revision is ${view.working.workingRev}, request carried ${body.workingRev}`,
          );
        }

        let pending = view.pending;
        let operation = body.operation;

        if (body.action === "undo") {
          operation = pending.at(-1);
          if (!operation) {
            return {
              noChange: true as const,
              workingRev: view.working.workingRev,
              pendingCount: 0,
            };
          }
          pending = pending.slice(0, -1);
        } else {
          if (!operation) {
            throw new ApiError("E_BAD_REQUEST", "redo requires an operation");
          }
          const result = applyCommand(view.timeline, operation.command, {
            mintId: minterFor(operation.id),
          });
          if (!result.ok) {
            throw new ApiError(result.error.code, result.error.message);
          }
          // Redo restores the exact accepted operation (including its id),
          // even when later history makes the command semantically redundant.
          // History fidelity matters more here than coalescing a no-op.
          pending = [...pending, operation];
        }

        const nextRev = view.working.workingRev + 1;
        await tx
          .update(workingState)
          .set({ pendingOps: pending, workingRev: nextRev })
          .where(
            and(
              eq(workingState.branchId, view.branch.id),
              eq(workingState.projectId, project.id),
            ),
          );

        return {
          workingRev: nextRev,
          pendingCount: pending.length,
          operation,
        };
      },
    );
  });
}
