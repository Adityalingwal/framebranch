/**
 * POST /api/branch — a boundary door. Creates a branch starting at the
 * source branch's current head, and returns its working view. If the source
 * is dirty it is auto-sealed first. Create + working record are one
 * transaction.
 */

import { branches, workingState } from "../../../db/schema";
import { findBranch, isDirty, loadBranchView } from "../../../server/branches";
import { createCommit } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { appendEvent } from "../../../server/events";
import { handleRequest, readBody } from "../../../server/handler";
import { SEAL_BEFORE_BRANCH_CREATE } from "../../../server/naming";
import { INITIAL_WORKING_REV } from "../../../server/project";
import { branchCreateBodySchema } from "../../../server/schemas";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, branchCreateBodySchema);

    return runWithTicket(
      db,
      project.id,
      "branch-create",
      body.ticket,
      async (tx) => {
        const source = await loadBranchView(tx, project.id, body.from, true);

        if (await findBranch(tx, project.id, body.name)) {
          // The unique branches(project_id, name) index makes duplicate
          // names real and detectable. E_BRANCH_EXISTS lets the UI say
          // "that name is taken" instead of a generic error.
          throw new ApiError(
            "E_BRANCH_EXISTS",
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
            kind: "auto",
            actorName: editorName,
          });
          sealedCommitId = sealed.commitId;
          headCommitId = sealed.commitId;
        }

        const [created] = await tx
          .insert(branches)
          .values({
            projectId: project.id,
            name: body.name,
            headCommitId,
            createdBy: editorName,
          })
          .returning();

        await tx.insert(workingState).values({
          branchId: created.id,
          projectId: project.id,
          baseCommitId: headCommitId,
          pendingOps: [],
          workingRev: INITIAL_WORKING_REV,
        });

        await appendEvent(tx, project.id, "branch-created", {
          branch: created.name,
          from: body.from,
          head: headCommitId,
          createdBy: editorName,
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
