/**
 * POST /api/agent/simulate — a boundary door. Applies a named script atomically:
 * all commands run in memory first; if any fail, nothing is written. If all
 * pass, one auto-commit is created with actor "agent" on the commit and
 * every op row.
 */

import { randomUUID } from "node:crypto";

import { applyCommand } from "@framebranch/engine";
import type { Timeline } from "@framebranch/engine";

import { agentScript } from "../../../../server/agent-scripts";
import { isDirty, loadBranchView } from "../../../../server/branches";
import { createCommit } from "../../../../server/commits";
import { ApiError } from "../../../../server/envelope";
import { handleRequest, readBody } from "../../../../server/handler";
import {
  SEAL_BEFORE_AGENT_RUN,
  agentCommitName,
} from "../../../../server/naming";
import { agentSimulateBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";
import { minterFor } from "../../../../server/timeline";
import type { PendingOp } from "../../../../server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, agentSimulateBodySchema);

    return runWithTicket(
      db,
      project.id,
      "agent-run",
      body.ticket,
      async (tx) => {
        // An unknown script name never reaches the branch (E_BAD_REQUEST).
        const script = agentScript(body.script);

        const view = await loadBranchView(tx, project.id, body.branch, true);
        if (isDirty(view)) {
          await createCommit({
            tx,
            projectId: project.id,
            branch: view.branch,
            working: view.working,
            timeline: view.timeline,
            name: SEAL_BEFORE_AGENT_RUN,
            actor: "user",
          });
        }

        // Re-read after the seal — the run starts from the sealed state.
        const fresh = await loadBranchView(tx, project.id, body.branch, true);

        // --- everything below happens in memory until it has ALL passed ---
        let timeline: Timeline = fresh.timeline;
        const applied: PendingOp[] = [];
        for (const command of script.build(timeline)) {
          // The op id is minted before applying because addClip's id minting
          // is derived from it — that is what makes replay deterministic.
          const opId = randomUUID();
          const result = applyCommand(timeline, command, {
            mintId: minterFor(opId),
          });
          if (!result.ok) {
            // Any throw rolls the whole transaction back, seal included:
            // "no changes were made" is literally true.
            throw new ApiError(result.error.code, result.error.message);
          }
          // no-change commands succeed but are not recorded (log stays clean).
          if (result.noChange) continue;
          timeline = result.timeline;
          applied.push({ id: opId, actor: "agent", command });
        }

        const commit = await createCommit({
          tx,
          projectId: project.id,
          branch: fresh.branch,
          // createCommit turns `pendingOps` into this commit's ops rows,
          // each with its own actor. The DB row is already empty (the branch
          // is clean), so this hands it the agent's batch directly instead
          // of writing the same list twice.
          working: { ...fresh.working, pendingOps: applied },
          timeline,
          name: agentCommitName(script.name),
          actor: "agent",
        });

        return {
          commitId: commit.commitId,
          name: commit.name,
          actor: "agent" as const,
          opsApplied: applied.length,
        };
      },
    );
  });
}
