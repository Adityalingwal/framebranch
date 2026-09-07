/**
 * GET /api/timeline — read-only, no ticket, no writes.
 *
 * Without `at`: the base commit's state with pending ops replayed on top —
 * the live working view, not the last saved version. Unchanged shape.
 *
 * With `at=‹commitId›` (B1 §2.3, B5 IMPL-NOTE a): the FROZEN timeline of
 * that card, plus the card facts the View bar needs. This is what "looking
 * at an old version" reads; it never touches the working record, so
 * entering and leaving View writes nothing.
 *
 * Same two refusals `GET /api/diff` uses, for the same reasons: a commit
 * this project does not have is E_COMMIT_NOT_FOUND (404); a commit that
 * exists but is not on this cut's chain is E_BAD_REQUEST (400) — History
 * never offered it, so asking for it is a malformed question, not a
 * missing thing.
 */

import { eq } from "drizzle-orm";

import type { Timeline } from "@framebranch/engine";

import { commits } from "../../../db/schema";
import { chainOf } from "../../../server/ancestry";
import { loadBranch, loadBranchView } from "../../../server/branches";
import { ApiError } from "../../../server/envelope";
import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadCommitTimeline } from "../../../server/timeline";
import type { CommitKind } from "../../../server/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live working view (no `at`). */
export type TimelineResponse = {
  timeline: Timeline;
  workingRev: number;
  pendingCount: number;
};

/** One card's frozen content (`at` given). */
export type TimelineAtResponse = {
  timeline: Timeline;
  commitId: string;
  name: string;
  kind: CommitKind;
  createdAt: string;
};

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const branch = requiredQuery(request, "branch");
    const at = new URL(request.url).searchParams.get("at");

    return db.transaction(async (tx) => {
      if (at !== null && at !== "") {
        // Unknown cut answers first, exactly as the live view does.
        const row = await loadBranch(tx, project.id, branch);
        const chain = await chainOf(tx, project.id, row.headCommitId);
        const card = chain.find((commit) => commit.id === at);
        if (!card) {
          const known = await tx
            .select({ id: commits.id })
            .from(commits)
            .where(eq(commits.projectId, project.id));
          throw known.some((commit) => commit.id === at)
            ? new ApiError(
                "E_BAD_REQUEST",
                `version "${at}" is not on cut "${branch}"`,
              )
            : new ApiError(
                "E_COMMIT_NOT_FOUND",
                `no version "${at}" in this project`,
              );
        }
        const response: TimelineAtResponse = {
          timeline: await loadCommitTimeline(tx, project.id, card.id),
          commitId: card.id,
          name: card.name,
          kind: card.kind,
          createdAt: card.createdAt.toISOString(),
        };
        return response;
      }

      const view = await loadBranchView(tx, project.id, branch);
      const response: TimelineResponse = {
        timeline: view.timeline,
        workingRev: view.working.workingRev,
        pendingCount: view.pending.length,
      };
      return response;
    });
  });
}
