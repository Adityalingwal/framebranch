/**
 * POST /api/branch/switch — a boundary door. If the source is dirty it is
 * auto-sealed (an `auto` card named by what changed; skipped when the
 * pending edits cancel out), then returns the target branch's working view.
 * One transaction.
 *
 * Nothing is stored server-side about which branch is "current" — the
 * switch is complete because the client sends the new branch name in its
 * next request.
 */

import { loadBranch, loadBranchView } from "../../../../server/branches";
import { appendEvent } from "../../../../server/events";
import { handleRequest, readBody } from "../../../../server/handler";
import { branchSwitchBodySchema } from "../../../../server/schemas";
import { sealIfDirty } from "../../../../server/seal";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, branchSwitchBodySchema);

    return runWithTicket(
      db,
      project.id,
      "branch-switch",
      body.ticket,
      async (tx) => {
        const source = await loadBranchView(tx, project.id, body.from, true);
        // Existence of `to` is checked BEFORE the seal, so a bad target
        // fails the whole transaction instead of leaving a seal behind.
        await loadBranch(tx, project.id, body.to);

        const seal = await sealIfDirty(tx, project.id, source, editorName);
        const sealedCommitId = seal.sealed ? seal.commitId : undefined;

        // Re-read AFTER the seal: when from === to, the seal changed it.
        const target = await loadBranchView(tx, project.id, body.to, true);

        await appendEvent(tx, project.id, "branch-switched", {
          from: body.from,
          to: body.to,
          editorName,
        });

        return {
          timeline: target.timeline,
          workingRev: target.working.workingRev,
          pendingCount: target.pending.length,
          ...(sealedCommitId ? { sealedCommitId } : {}),
        };
      },
    );
  });
}
