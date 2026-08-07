/**
 * POST /api/branch/switch — a boundary door. If the source is dirty it is
 * auto-sealed, then returns the target branch's working view. One transaction.
 *
 * Nothing is stored server-side about which branch is "current" — the
 * switch is complete because the client sends the new branch name in its
 * next request.
 */

import {
  isDirty,
  loadBranch,
  loadBranchView,
} from "../../../../server/branches";
import { createCommit } from "../../../../server/commits";
import { handleRequest, readBody } from "../../../../server/handler";
import { SEAL_BEFORE_BRANCH_SWITCH } from "../../../../server/naming";
import { branchSwitchBodySchema } from "../../../../server/schemas";
import { runWithTicket } from "../../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
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

        let sealedCommitId: string | undefined;
        if (isDirty(source)) {
          const sealed = await createCommit({
            tx,
            projectId: project.id,
            branch: source.branch,
            working: source.working,
            timeline: source.timeline,
            name: SEAL_BEFORE_BRANCH_SWITCH,
            actor: "user",
          });
          sealedCommitId = sealed.commitId;
        }

        // Re-read AFTER the seal: when from === to, the seal changed it.
        const target = await loadBranchView(tx, project.id, body.to, true);

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
