/**
 * /api/branch
 *
 * GET — A1a/A1b: every cut with its head, creator and Ready state, `main`
 * first then A→Z. The ONE source of "which cuts exist / where is each head"
 * for the UI (no client-side head bookkeeping). Read-only, no ticket.
 *
 * POST — a boundary door. Creates a branch starting at the source branch's
 * current head, and returns its working view. If the source is dirty it is
 * auto-sealed first. Create + working record are one transaction.
 */

import { eq } from "drizzle-orm";

import { branches, workingState } from "../../../db/schema";
import {
  createBranch,
  findBranch,
  loadBranchView,
} from "../../../server/branches";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import { branchCreateBodySchema } from "../../../server/schemas";
import { sealIfDirty } from "../../../server/seal";
import { runWithTicket } from "../../../server/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type BranchListItem = {
  name: string;
  /** A1b — the head commit id; the UI resolves name/kind via History. */
  head: string;
  /** F2a — who created the cut; `main` (seeded) has none. */
  createdBy: string | null;
  /** F3(4) — null unless marked Ready. */
  ready: null | {
    note: string;
    by: string;
    at: string;
    /** The working rev moved since Ready was marked (edits, not head). */
    editedSince: boolean;
  };
};

/** A1a patch (d): `main` first, the rest by name A→Z. */
function byMainThenName(a: { name: string }, b: { name: string }): number {
  if (a.name === "main") return b.name === "main" ? 0 : -1;
  if (b.name === "main") return 1;
  return a.name.localeCompare(b.name);
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const rows = await db
      .select({
        name: branches.name,
        head: branches.headCommitId,
        createdBy: branches.createdBy,
        readyNote: branches.readyNote,
        readyBy: branches.readyBy,
        readyAt: branches.readyAt,
        readyWorkingRev: branches.readyWorkingRev,
        workingRev: workingState.workingRev,
      })
      .from(branches)
      .innerJoin(workingState, eq(workingState.branchId, branches.id))
      .where(eq(branches.projectId, project.id));

    const list: BranchListItem[] = rows.sort(byMainThenName).map((row) => ({
      name: row.name,
      head: row.head,
      createdBy: row.createdBy,
      ready:
        row.readyAt === null
          ? null
          : {
              note: row.readyNote ?? "",
              by: row.readyBy ?? "",
              at: row.readyAt.toISOString(),
              editedSince: row.workingRev !== row.readyWorkingRev,
            },
    }));
    return { branches: list };
  });
}

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
        const seal = await sealIfDirty(tx, project.id, source, editorName);
        if (seal.sealed) {
          sealedCommitId = seal.commitId;
          headCommitId = seal.commitId;
        }

        const { branch: created } = await createBranch(tx, project.id, {
          name: body.name,
          from: body.from,
          headCommitId,
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
