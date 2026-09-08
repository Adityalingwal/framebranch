/**
 * POST /api/ops — the edit door. One endpoint for all eight verbs.
 *
 * workingRev is a compare-and-swap: a stale rev is rejected with E_STALE_REV
 * and the UI silently refreshes. A no-change command (e.g. same-position move)
 * must not bump the counter or be recorded — nothing happened.
 */

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { applyCommand } from "@framebranch/engine";

import { workingState } from "../../../db/schema";
import { loadBranchView } from "../../../server/branches";
import { ApiError } from "../../../server/envelope";
import { appendEvent } from "../../../server/events";
import { handleRequest, readBody } from "../../../server/handler";
import { opsBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";
import { minterFor } from "../../../server/timeline";
import type { PendingOp } from "../../../server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
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

      // F2a/F4 — who last touched this cut's working area (F4 reads it).
      await tx
        .update(workingState)
        .set({
          pendingOps: pending,
          workingRev: nextRev,
          lastEditorName: editorName,
        })
        .where(
          and(
            eq(workingState.branchId, view.branch.id),
            eq(workingState.projectId, project.id),
          ),
        );

      // J1 (B4b) — the one event a plain edit produces. Without it the
      // other tab (and the editor's own top bar) could never learn that a
      // Ready cut has moved: nothing else follows an edit, and
      // `editedSince` is computed from exactly this rev. One row per edit
      // is fine at demo scale — the poller coalesces a tick's events into
      // ONE set of invalidations.
      //
      // Deliberately NOT on the no-change path above: a command that
      // changes nothing is not recorded as a pending op either.
      await appendEvent(tx, project.id, "edit", {
        cut: body.branch,
        workingRev: nextRev,
        editorName,
      });

      return { workingRev: nextRev, pendingCount: pending.length };
    });
  });
}
