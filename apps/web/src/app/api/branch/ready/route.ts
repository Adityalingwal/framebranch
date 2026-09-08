/**
 * /api/branch/ready — F3(4) "Ready for main".
 *
 * B4b lock (1): ONE resource, TWO verbs. `POST` marks a cut ready with a
 * one-line note; `DELETE` un-marks it. Both write the same four columns on
 * the branch row (`ready_note/ready_by/ready_at/ready_working_rev`) — Ready
 * is a MARK, never a lock: main is never closed, there is no queue, no
 * approve/reject and no "declined" state.
 *
 * `ready_working_rev` is the cut's working rev at the moment of marking.
 * That is what makes `Edited since ready` (#171) true without a second
 * column: only `POST /api/ops` moves `working_rev` (a seal, a Mark and a
 * restore all keep it), so `workingRev !== readyWorkingRev` is exactly
 * "someone edited this cut after saying it was ready".
 *
 * The mark is CLEARED in two other places, both outside this file: landing
 * (`server/merge.ts`, F3(4)(d)) and the agent marking its own fresh cut
 * (`api/agent/run`, #172).
 */

import { and, eq, sql } from "drizzle-orm";

import { branches } from "../../../../db/schema";
import { loadBranchView } from "../../../../server/branches";
import { ApiError } from "../../../../server/envelope";
import { appendEvent } from "../../../../server/events";
import { handleRequest, readBody } from "../../../../server/handler";
import {
  readyClearBodySchema,
  readySetBodySchema,
} from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The answer shape, identical to the `ready` field `GET /api/branch`
 * returns, so a client may write it straight into its cache.
 */
export type ReadyResponse = {
  cut: string;
  ready: null | {
    note: string;
    by: string;
    at: string;
    editedSince: boolean;
  };
};

/**
 * F1/F2a IMPL-NOTE (4) — the direction is fixed server-side, not merely
 * hidden in the UI: main is what cuts are brought INTO, so it can never be
 * "ready for main" itself.
 */
function refuseMain(cut: string): void {
  if (cut === "main") {
    throw new ApiError("E_BAD_REQUEST", "main is never brought into itself");
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, readySetBodySchema);
    refuseMain(body.cut);

    return runWithTicket(
      db,
      project.id,
      "ready-set",
      body.ticket,
      async (tx): Promise<ReadyResponse> => {
        // Unknown cut → the existing 404 (loadBranch throws it).
        const view = await loadBranchView(tx, project.id, body.cut, true);

        // Re-marking an already-Ready cut is an OVERWRITE, not a conflict:
        // "it is ready again, and here is what changed" is the same act.
        const [updated] = await tx
          .update(branches)
          .set({
            readyNote: body.note,
            readyBy: editorName,
            readyAt: sql`now()`,
            readyWorkingRev: view.working.workingRev,
          })
          .where(
            and(
              eq(branches.id, view.branch.id),
              eq(branches.projectId, project.id),
            ),
          )
          .returning();

        await appendEvent(tx, project.id, "ready-set", {
          cut: body.cut,
          by: editorName,
          note: body.note,
        });

        return {
          cut: body.cut,
          ready: {
            note: body.note,
            by: editorName,
            at: (updated.readyAt as Date).toISOString(),
            // Just marked AT this rev, so nothing can have moved since.
            editedSince: false,
          },
        };
      },
    );
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    // A JSON body on DELETE: `fetch` allows it and the route handler reads
    // it exactly like a POST's, so the two verbs share one body shape.
    const body = await readBody(request, readyClearBodySchema);
    refuseMain(body.cut);

    return runWithTicket(
      db,
      project.id,
      "ready-clear",
      body.ticket,
      async (tx): Promise<ReadyResponse> => {
        const view = await loadBranchView(tx, project.id, body.cut, true);

        // Not ready → nothing to un-say. A no-op, not a 409: the UI only
        // offers `✕ Not ready anymore` on a Ready cut, so this is a race
        // (two tabs un-marking at once), and both should simply succeed.
        if (view.branch.readyAt === null) {
          return { cut: body.cut, ready: null };
        }

        await tx
          .update(branches)
          .set({
            readyNote: null,
            readyBy: null,
            readyAt: null,
            readyWorkingRev: null,
          })
          .where(
            and(
              eq(branches.id, view.branch.id),
              eq(branches.projectId, project.id),
            ),
          );

        await appendEvent(tx, project.id, "ready-cleared", {
          cut: body.cut,
          by: editorName,
          reason: "unmarked",
        });

        return { cut: body.cut, ready: null };
      },
    );
  });
}
