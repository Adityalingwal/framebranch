/**
 * POST /api/agent/run { preset } — a boundary door, and I1's one click.
 *
 * ONE transaction does all of it: fork `agent-‹preset›` off main's (sealed)
 * head, run the script there in memory, write one `agent-run` card. If any
 * command fails, the whole transaction rolls back — the branch included —
 * so a failed run leaves NO orphan cut. That matters beyond tidiness: the
 * Agent panel derives "this preset has run" from the cut existing (I1 patch
 * (b)), so an orphan cut would make a preset read `Done` for a run that
 * never happened.
 *
 * The cut is created by the SERVER, not handed in (I1 patch (a)), and its
 * creator is always `Agent` — never the `X-Editor-Name` header, even though
 * a person clicked the button (#186: `agent-tighten-intro · Agent`).
 */

import { randomUUID } from "node:crypto";

import { applyCommand } from "@framebranch/engine";
import type { Timeline } from "@framebranch/engine";

import {
  AGENT_ACTOR_NAME,
  agentCutName,
  agentPreset,
} from "../../../../server/agent-scripts";
import {
  createBranch,
  findBranch,
  loadBranchView,
} from "../../../../server/branches";
import { createCommit } from "../../../../server/commits";
import { ApiError } from "../../../../server/envelope";
import { handleRequest, readBody } from "../../../../server/handler";
import { agentRunBodySchema } from "../../../../server/schemas";
import { sealIfDirty } from "../../../../server/seal";
import { runWithTicket } from "../../../../server/tickets";
import { minterFor } from "../../../../server/timeline";
import type { PendingOp } from "../../../../server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** I1: the agent forks from main and only ever writes on its own cut. */
const SOURCE_CUT = "main";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, agentRunBodySchema);

    return runWithTicket(db, project.id, "agent-run", body.ticket, async (tx) => {
      // An unknown preset never reaches the database (E_BAD_REQUEST).
      const script = agentPreset(body.preset);
      const cut = agentCutName(script.id);

      if (await findBranch(tx, project.id, cut)) {
        // The UI never sends this — the preset's button reads `Done` once
        // the cut exists. Safety net only, and it reuses the existing
        // envelope code rather than inventing a string.
        throw new ApiError(
          "E_BRANCH_EXISTS",
          `a branch named "${cut}" already exists`,
        );
      }

      // Fork from main exactly the way `POST /api/branch` forks from a
      // dirty cut: seal first (the editor's name goes on that auto card,
      // because the editor is who left main dirty), then fork the seal.
      const source = await loadBranchView(tx, project.id, SOURCE_CUT, true);
      const seal = await sealIfDirty(tx, project.id, source, editorName);
      const headCommitId = seal.sealed
        ? seal.commitId
        : source.branch.headCommitId;

      const { branch } = await createBranch(tx, project.id, {
        name: cut,
        from: SOURCE_CUT,
        headCommitId,
        createdBy: AGENT_ACTOR_NAME,
      });

      // The fresh cut's view: pending is empty by construction, so its
      // timeline is exactly the commit we forked.
      const view = await loadBranchView(tx, project.id, cut, true);

      // --- everything below happens in memory until it has ALL passed ---
      let timeline: Timeline = view.timeline;
      const applied: PendingOp[] = [];
      for (const command of script.build(timeline)) {
        // The op id is minted before applying because addClip's id minting
        // is derived from it — that is what makes replay deterministic.
        const opId = randomUUID();
        const result = applyCommand(timeline, command, {
          mintId: minterFor(opId),
        });
        if (!result.ok) {
          // Any throw rolls the whole transaction back — the branch row and
          // its working row with it. "Nothing changed" (#188) is literally
          // true, and no half-made cut is left behind.
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
        branch,
        // createCommit turns `pendingOps` into this commit's ops rows, each
        // with its own actor. The DB row is empty (the cut was just made),
        // so this hands it the agent's batch directly instead of writing
        // the same list twice.
        working: { ...view.working, pendingOps: applied },
        timeline,
        // C1(3) / naming.ts G4-N: the card is named after the preset.
        name: script.name,
        actor: "agent",
        kind: "agent-run",
        actorName: AGENT_ACTOR_NAME,
      });

      return {
        cut,
        commitId: commit.commitId,
        name: commit.name,
        opsApplied: applied.length,
      };
    });
  });
}
