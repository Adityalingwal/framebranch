/**
 * GET /api/diff?cut=‹name›&a=‹commitId|now›&b=‹commitId|now› — read-only.
 *
 * Returns the shared presenter's rows for the two points, where `now` is
 * that cut's working timeline (base + pending ops). D2/D4(12): the server
 * canonicalises OLDER → NEWER and says which input was older, so the UI can
 * label the lanes and a swap can never invert the reading:
 *   - `now` is always the newer side;
 *   - between two commits, the older one is the one LOWER in this cut's
 *     History order (B2's time-desc chain — D3 patch);
 *   - a commit outside this cut's chain is refused (E_BAD_REQUEST, 400); an
 *     unknown commit is E_COMMIT_NOT_FOUND (404).
 */

import { eq } from "drizzle-orm";

import type { Timeline } from "@framebranch/engine";

import { commits } from "../../../db/schema";
import { chainOf } from "../../../server/ancestry";
import { loadBranchView } from "../../../server/branches";
import { presentDiff } from "../../../server/diff-rows";
import type { DiffRow } from "../../../server/diff-rows";
import { ApiError } from "../../../server/envelope";
import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadCommitTimeline } from "../../../server/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The working-timeline side (D2: "Now"). */
export const NOW = "now";

export type DiffResponse = {
  rows: DiffRow[];
  count: number;
  runtime: { before: string; after: string };
  /** Which INPUT ended up as the Before lane. */
  older: "a" | "b";
  /**
   * B2 lock (4) — only with `timelines=1`: the two materialised timelines
   * the rows were computed from, so the Compare lanes and the rows come
   * from ONE snapshot and can never drift. Left out otherwise, so the top
   * bar's count query stays as light as it is today.
   */
  before?: Timeline;
  after?: Timeline;
};

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const cut = requiredQuery(request, "cut");
    const a = requiredQuery(request, "a");
    const b = requiredQuery(request, "b");
    // B2 §2.2 — opt-in, so the chip's count query is unchanged.
    const withTimelines =
      new URL(request.url).searchParams.get("timelines") === "1";

    return db.transaction(async (tx): Promise<DiffResponse> => {
      // Unknown cut → E_BRANCH_NOT_FOUND, like every cut-scoped read.
      const view = await loadBranchView(tx, project.id, cut);
      const chain = await chainOf(tx, project.id, view.branch.headCommitId);
      const position = new Map(chain.map((row, index) => [row.id, index]));
      const projectIds = new Set(
        (
          await tx
            .select({ id: commits.id })
            .from(commits)
            .where(eq(commits.projectId, project.id))
        ).map((row) => row.id),
      );

      // Rank: `now` is newest (-1); otherwise the index in this cut's
      // History (0 = head) — a LARGER index is lower in the list = older.
      const rank = (ref: string): number => {
        if (ref === NOW) return -1;
        const index = position.get(ref);
        if (index !== undefined) return index;
        if (projectIds.has(ref)) {
          throw new ApiError(
            "E_BAD_REQUEST",
            `version "${ref}" is not on cut "${cut}"`,
          );
        }
        throw new ApiError(
          "E_COMMIT_NOT_FOUND",
          `no version "${ref}" in this project`,
        );
      };

      const rankA = rank(a);
      const rankB = rank(b);
      // Equal ranks (same point twice) → `a` is Before; nothing differs.
      const older: "a" | "b" = rankA >= rankB ? "a" : "b";
      const [olderRef, newerRef] = older === "a" ? [a, b] : [b, a];

      const materialise = (ref: string) =>
        ref === NOW
          ? Promise.resolve(view.timeline)
          : loadCommitTimeline(tx, project.id, ref);
      const [before, after] = await Promise.all([
        materialise(olderRef),
        materialise(newerRef),
      ]);

      const presented = presentDiff(before, after);
      return {
        rows: presented.rows,
        count: presented.count,
        runtime: presented.runtime,
        older,
        ...(withTimelines ? { before, after } : {}),
      };
    });
  });
}
