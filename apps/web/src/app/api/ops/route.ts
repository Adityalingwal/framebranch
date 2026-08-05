/**
 * POST /api/ops — docs/11 C4 (3), the EDIT door. One endpoint for all
 * eight verbs (docs/09 Item 3: the command is first-class data).
 *
 * req:  { branch, workingRev, ticket, command }
 * data: { workingRev, pendingCount }
 *       or, for a no-change command (A4 / F9):
 *       { noChange: true, workingRev: UNCHANGED, pendingCount: UNCHANGED }
 *
 * Locked details:
 *  - The ENGINE decides. The server validates the command's shape, hands it
 *    to `applyCommand`, and stores whatever comes back. Verb errors
 *    (E_OVERLAP, E_CLIP_NOT_FOUND, …) propagate with their own codes.
 *  - workingRev is a compare-and-swap (docs/09 triage #6): a stale rev is
 *    rejected with E_STALE_REV and the UI silently refreshes.
 *  - F9: a no-change command must NOT bump the counter. Bumping it would
 *    desync client and server and cause spurious E_STALE_REV. A4 also says
 *    it must not be recorded — nothing happened, so the log stays clean.
 *  - working_rev is monotonic and never resets (C3).
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { applyCommand } from "@framebranch/engine";

import { workingState } from "../../../db/schema";
import { loadBranchView } from "../../../server/branches";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import { opsBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";
import { minterFor } from "../../../server/timeline";
import type { PendingOp } from "../../../server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, opsBodySchema);

    return runWithTicket(db, project.id, "ops", body.ticket, async (tx) => {
      const view = await loadBranchView(tx, project.id, body.branch, true);

      if (view.working.workingRev !== body.workingRev) {
        throw new ApiError(
          "E_STALE_REV",
          `working revision is ${view.working.workingRev}, request carried ${body.workingRev}`,
        );
      }

      // The op's id is minted BEFORE applying, because the engine's id
      // minting for addClip is derived from it — that is what makes replay
      // rebuild exactly the same clip ids (see server/timeline.ts).
      const opId = randomUUID();
      const result = applyCommand(view.timeline, body.command, {
        mintId: minterFor(opId),
      });

      if (!result.ok) {
        throw new ApiError(result.error.code, result.error.message);
      }

      if (result.noChange) {
        return {
          noChange: true as const,
          workingRev: view.working.workingRev,
          pendingCount: view.pending.length,
        };
      }

      const op: PendingOp = {
        id: opId,
        actor: "user",
        command: body.command,
      };
      const pending = [...view.pending, op];
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

      return { workingRev: nextRev, pendingCount: pending.length };
    });
  });
}
