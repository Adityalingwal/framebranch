/**
 * POST /api/branch — docs/11 C4 F5(c) + F6, a BOUNDARY door.
 *
 * req:  { name, from, ticket }
 * data: { branchId, name, headCommitId }  (+ sealedCommitId if a seal ran)
 *
 * Create AND switch: the new branch starts at `from`'s current head. If
 * `from` is dirty, it is auto-sealed FIRST — that is docs/09 Item 6a(4)'s
 * pre-existing rule (six boundary endpoints seal when dirty); this
 * endpoint is only its doorbell. Seal + create + working record are one
 * transaction (#16(1)).
 *
 * "Switch" needs no server-side state: F5 locked that the server never
 * remembers a current branch, so creating the branch IS the switch — the
 * client simply starts sending this name.
 */

import { branches, workingState } from "../../../db/schema";
import { findBranch, isDirty, loadBranchView } from "../../../server/branches";
import { createCommit } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import { SEAL_BEFORE_BRANCH_CREATE } from "../../../server/naming";
import { INITIAL_WORKING_REV } from "../../../server/project";
import { branchCreateBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const body = await readBody(request, branchCreateBodySchema);

    return runWithTicket(
      db,
      project.id,
      "branch-create",
      body.ticket,
      async (tx) => {
        const source = await loadBranchView(tx, project.id, body.from, true);

        if (await findBranch(tx, project.id, body.name)) {
          // No dedicated "name taken" code exists in the locked C4 list and
          // none is invented here; E_INVALID_VALUE is its closest member.
          throw new ApiError(
            "E_INVALID_VALUE",
            `a branch named "${body.name}" already exists`,
          );
        }

        let sealedCommitId: string | undefined;
        let headCommitId = source.branch.headCommitId;
        if (isDirty(source)) {
          const sealed = await createCommit({
            tx,
            projectId: project.id,
            branch: source.branch,
            working: source.working,
            timeline: source.timeline,
            name: SEAL_BEFORE_BRANCH_CREATE,
            actor: "user",
          });
          sealedCommitId = sealed.commitId;
          headCommitId = sealed.commitId;
        }

        const [created] = await tx
          .insert(branches)
          .values({ projectId: project.id, name: body.name, headCommitId })
          .returning();

        await tx.insert(workingState).values({
          branchId: created.id,
          projectId: project.id,
          baseCommitId: headCommitId,
          pendingOps: [],
          workingRev: INITIAL_WORKING_REV,
        });

        return {
          branchId: created.id,
          name: created.name,
          headCommitId,
          ...(sealedCommitId ? { sealedCommitId } : {}),
        };
      },
    );
  });
}
