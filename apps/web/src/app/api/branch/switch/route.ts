/**
 * POST /api/branch/switch — docs/11 C4 F5(b) + F6, a BOUNDARY door.
 * This is what test G3 exercises.
 *
 * req:  { from, to, ticket }
 * data: { timeline, workingRev, pendingCount }  (+ sealedCommitId if sealed)
 *
 * ONE transaction: if `from` is dirty, auto-seal it with the template name
 * (docs/09 Item 6a(4) — "chupchaap auto-seal", no popup), then return
 * `to`'s working view so the UI can render the switch directly.
 *
 * Nothing about the switch is stored: F5 locked that the server keeps no
 * current-branch pointer (hidden state + multi-tab clash). The switch is
 * complete because the client now sends `to` in its next request.
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
