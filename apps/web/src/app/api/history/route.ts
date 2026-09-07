/**
 * GET /api/history?cut=‹name› — read-only. B2: the current cut's chain ONLY
 * — every ancestor of the cut's head through BOTH parents (a bring-in card
 * has two), de-duplicated, ordered time desc; equal timestamps → child
 * above its parent (B2 patch). Index 0 is the head.
 *
 * Each card carries its kind, actor name and `changes` = the presenter's
 * row count of this card vs its FIRST parent (D2 patch: real differences,
 * never op counts). 0 for seed and import cards (a seed has no parent; an
 * import is a fresh start with new ids, so a diff would be noise).
 *
 * B1 §2.2 — `changes` is STORED at commit time (`commits.changes`), so this
 * route reads it instead of diffing every card on every request. One
 * exception, and it is the reason this read can write: a row created before
 * that column existed carries NULL. Such a row is counted once and the
 * value is UPDATEd inside this read's transaction, so the next GET (and
 * every one after it) is a pure read. A project created on this build never
 * takes that path — every writer fills the column.
 *
 * `cut` missing → E_BAD_REQUEST; unknown → E_BRANCH_NOT_FOUND (the same
 * answer `GET /api/timeline` gives).
 */

import { and, eq } from "drizzle-orm";

import type { ImportWarning } from "@framebranch/engine";

import { commits } from "../../../db/schema";
import { chainOf } from "../../../server/ancestry";
import { loadBranch } from "../../../server/branches";
import type { CommitRow } from "../../../server/commits";
import { presentDiff } from "../../../server/diff-rows";
import { handleRequest, requiredQuery } from "../../../server/handler";
import { loadCommitTimeline } from "../../../server/timeline";
import type { CommitKind } from "../../../server/types";
import type { Tx } from "../../../server/tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type HistoryItem = {
  commitId: string;
  kind: CommitKind;
  name: string;
  /** null only on the seed card (meta shows `Start · ‹time›`). */
  actorName: string | null;
  /** Kept for today's UI badges (👤/🤖); B1 switches to `kind`. */
  actor: "user" | "agent";
  createdAt: string;
  parents: string[];
  /** Presenter row count vs the first parent; 0 for seed/import. */
  changes: number;
  importWarnings: ImportWarning[] | null;
};

/** Cards whose `changes` is 0 by definition (no meaningful "before"). */
const NO_CHANGES_KINDS: ReadonlySet<CommitKind> = new Set(["seed", "import"]);

export async function historyOf(
  tx: Tx,
  projectId: string,
  cut: string,
): Promise<HistoryItem[]> {
  const branch = await loadBranch(tx, projectId, cut);
  const chain = await chainOf(tx, projectId, branch.headCommitId);

  const items: HistoryItem[] = [];
  for (const row of chain) {
    items.push({
      commitId: row.id,
      kind: row.kind,
      name: row.name,
      actorName: row.actorName,
      actor: row.actor,
      createdAt: row.createdAt.toISOString(),
      // parent2_id is non-null only on bring-in cards (C3), so a normal
      // card reports one parent and the root reports none.
      parents: [row.parentId, row.parent2Id].filter(
        (id): id is string => id !== null,
      ),
      changes: row.changes ?? (await fillLegacyChanges(tx, projectId, row)),
      importWarnings: row.importWarnings,
    });
  }
  return items;
}

/**
 * A pre-B1 row has no stored count. Compute it once and write it back, so
 * this GET stops writing after the first pass over a legacy project.
 */
async function fillLegacyChanges(
  tx: Tx,
  projectId: string,
  row: CommitRow,
): Promise<number> {
  let count = 0;
  if (row.parentId !== null && !NO_CHANGES_KINDS.has(row.kind)) {
    // For a bring-in, parent 1 (`parentId`) is the `into` side by
    // construction (createCommit sets it from the into-branch's base).
    const [before, after] = await Promise.all([
      loadCommitTimeline(tx, projectId, row.parentId),
      loadCommitTimeline(tx, projectId, row.id),
    ]);
    count = presentDiff(before, after).count;
  }
  await tx
    .update(commits)
    .set({ changes: count })
    .where(and(eq(commits.id, row.id), eq(commits.projectId, projectId)));
  return count;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const cut = requiredQuery(request, "cut");
    return db.transaction(async (tx) => ({
      cut,
      commits: await historyOf(tx, project.id, cut),
    }));
  });
}
