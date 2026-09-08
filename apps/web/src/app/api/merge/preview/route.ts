/**
 * GET /api/merge/preview?from=‹cut›[&choices=‹url-encoded JSON›] — the
 * Bring-in preview (F3(1) STATELESS, F3(2), lock (3)).
 *
 * It answers the question the whole screen asks: "what would main look like
 * if I brought this cut in, given the decisions I have made so far?" — and
 * it WRITES NOTHING. No seal, no draft row, no event, no ticket. That is
 * what makes `Cancel — nothing changes` literally true (F5 / C-2), and it
 * is why every choice can simply re-ask this endpoint.
 *
 * `into` is always `main` (F1), so it is not a parameter.
 *
 * Sides: `ours` = main's WORKING timeline, `theirs` = the cut's WORKING
 * timeline, `base` = the merge base's commit (Original, F2b). Working, not
 * sealed heads: the preview must show what LANDING would produce, and the
 * landing seals first — a seal changes no content, so the conflicts (and
 * their ids) are identical before and after it.
 */

import { recompute } from "@framebranch/engine";
import type { MergeChoice, MergeSuccess, Timeline } from "@framebranch/engine";
import { z } from "zod";

import { loadBranchView } from "../../../../server/branches";
import {
  buildAfterDisplay,
  presentConflictCards,
} from "../../../../server/conflict-cards";
import type {
  ConflictCard,
  ConflictRecord,
} from "../../../../server/conflict-cards";
import { presentDiff } from "../../../../server/diff-rows";
import type { DiffRow } from "../../../../server/diff-rows";
import { ApiError } from "../../../../server/envelope";
import { handleRequest, requiredQuery } from "../../../../server/handler";
import { findMergeBase } from "../../../../server/merge";
import { mergeChoiceSchema } from "../../../../server/schemas";
import { loadCommitTimeline } from "../../../../server/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lock (3) — the four plain fields the landing revalidates. */
export type BringInToken = {
  mainHead: string;
  cutHead: string;
  mainRev: number;
  cutRev: number;
};

export type BringInPreview = {
  from: string;
  rows: DiffRow[];
  count: number;
  runtime: { before: string; after: string };
  /** main's working timeline. */
  before: Timeline;
  /** What landing would produce, plus the undecided clips (lock (4)(ii)). */
  after: Timeline;
  undecidedClipIds: string[];
  conflicts: ConflictCard[];
  counts: { total: number; decided: number };
  token: BringInToken;
};

/**
 * Conflict ids are `m4:` + an encoded payload, so a `id:choice,…` list would
 * break on the first comma. The parameter is URL-encoded JSON instead.
 */
const choicesSchema = z.record(z.string(), mergeChoiceSchema);

function readChoices(request: Request): Record<string, MergeChoice> {
  const raw = new URL(request.url).searchParams.get("choices");
  if (raw === null || raw === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("E_BAD_REQUEST", `"choices" is not valid JSON`);
  }
  const result = choicesSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(
      "E_BAD_REQUEST",
      `invalid "choices": ${result.error.issues[0].message}`,
    );
  }
  return result.data;
}

/**
 * The engine returns only the conflicts that are still UNANSWERED, so one
 * call cannot describe a card the user has already decided. The card list is
 * therefore built from two runs:
 *
 *   - `known`  — no choices at all: every conflict that exists at the start,
 *                in the order the cards will appear;
 *   - `open`   — with the choices: the ones still to decide, plus any that
 *                only appeared BECAUSE of an answer.
 *
 * A conflict from `known` that is neither open nor answered was dissolved by
 * another answer — it is dropped, or "decisions left" would never reach 0.
 * An answered conflict that neither run describes (created and answered in
 * the same cascade) is recovered by asking the engine what the choices
 * WITHOUT that one answer produce.
 *
 * Each record carries the COMPOSED draft of the run that reported it (§ the
 * `ConflictRecord` comment): an answered overlap does not exist in the
 * current run any more, so only that run still shows where its two clips
 * collided. The `open` run wins for a conflict both runs describe — it is
 * the one the rest of the screen is built from.
 */
function orderConflicts(input: {
  base: Timeline;
  ours: Timeline;
  theirs: Timeline;
  choices: Record<string, MergeChoice>;
  known: MergeSuccess;
  open: MergeSuccess;
}): ConflictRecord[] {
  const records = new Map<string, ConflictRecord>();
  const order: string[] = [];
  const add = (record: ConflictRecord, override: boolean) => {
    const id = record.conflict.conflictId;
    if (!records.has(id)) order.push(id);
    else if (!override) return;
    records.set(id, record);
  };
  const draftOf = (run: MergeSuccess): Timeline => run.composed ?? run.timeline;
  for (const conflict of input.known.conflicts) {
    add({ conflict, composed: draftOf(input.known) }, false);
  }
  for (const conflict of input.open.conflicts) {
    add({ conflict, composed: draftOf(input.open) }, true);
  }

  // No cap: every supplied id neither run describes gets its own lookup, so
  // a decided card can never be dropped from the list (Codex BUG 3 — with a
  // cap of 8 an eleven-link cascade lost a card AND a count). The work is
  // bounded by the number of answers on screen, which at demo scale is a
  // handful; each lookup is one more `recompute` over the same three
  // timelines.
  const missing = Object.keys(input.choices).filter((id) => !records.has(id));
  for (const id of missing) {
    const without = { ...input.choices };
    delete without[id];
    const run = recompute(input.base, input.ours, input.theirs, without);
    if (!run.ok) continue;
    const found = run.conflicts.find((conflict) => conflict.conflictId === id);
    if (found) add({ conflict: found, composed: draftOf(run) }, true);
  }

  // An id still unknown after all that has NO effect on the engine's answer
  // and is therefore neither a card nor a count (Codex BUG 4): `recompute`
  // consults a saved choice only when it MEETS that conflict, and `status`
  // is "no conflict is still open", never a count of the keys it was handed
  // (engine `merge.ts`, `recompute`). It is deliberately not a 400 either —
  // refusing would strand a user whose stored answer, for a conflict another
  // answer has since dissolved, is still in sessionStorage. The landing is
  // the same story: `finalizeCheck` reads `status`, so a stale key cannot
  // make it pass or fail.
  const openIds = new Set(
    input.open.conflicts.map((conflict) => conflict.conflictId),
  );
  return order
    .filter((id) => openIds.has(id) || input.choices[id] !== undefined)
    .map((id) => records.get(id)!);
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project }) => {
    const from = requiredQuery(request, "from");
    if (from === "main") {
      // The same refusal `POST /api/merge` gives (schemas.ts): two distinct
      // cuts are required, a cut cannot be brought into itself.
      throw new ApiError(
        "E_BAD_REQUEST",
        "a branch cannot be merged into itself",
      );
    }
    const choices = readChoices(request);

    return db.transaction(async (tx): Promise<BringInPreview> => {
      // Read-only: no `lock` argument anywhere below, so a preview never
      // blocks an edit (and never queues behind one).
      const main = await loadBranchView(tx, project.id, "main");
      // Unknown cut → E_BRANCH_NOT_FOUND (404), like every cut-scoped read.
      const cut = await loadBranchView(tx, project.id, from);

      const mainHead = main.branch.headCommitId;
      const cutHead = cut.branch.headCommitId;
      const baseCommitId = await findMergeBase(
        tx,
        project.id,
        mainHead,
        cutHead,
      );
      const base = await loadCommitTimeline(tx, project.id, baseCommitId);
      const ours = main.timeline;
      const theirs = cut.timeline;

      const answered = recompute(base, ours, theirs, choices);
      if (!answered.ok) {
        // The UI only ever sends choices its own buttons produced, so this
        // is a guard, not a path anyone walks.
        throw new ApiError("E_MERGE_PRECONDITION", answered.error.message);
      }
      const known = recompute(base, ours, theirs, {});
      if (!known.ok) {
        throw new ApiError("E_MERGE_PRECONDITION", known.error.message);
      }

      const records = orderConflicts({
        base,
        ours,
        theirs,
        choices,
        known,
        open: answered,
      });

      const { after, undecidedClipIds } = buildAfterDisplay(
        answered.timeline,
        ours,
        answered.conflicts,
      );

      const cards = presentConflictCards({
        base,
        ours,
        theirs,
        after,
        cutName: from,
        conflicts: records,
        choices,
      });

      const presented = presentDiff(ours, after);
      // An undecided clip sits exactly where main has it, so it produces no
      // row of its own. The filter is a safety net for the one case that
      // could still catch it — a ripple group that happens to include it;
      // dropping the whole group is the honest answer there (the card is
      // that clip's row).
      const undecided = new Set(undecidedClipIds);
      const rows = presented.rows.filter(
        (row) =>
          ![...row.laneIds.before, ...row.laneIds.after].some((id) =>
            undecided.has(id),
          ),
      );

      return {
        from,
        rows,
        // D4(10): the count is the rows this answer actually carries.
        count: rows.length,
        runtime: presented.runtime,
        before: ours,
        after,
        undecidedClipIds,
        conflicts: cards,
        counts: {
          total: cards.length,
          decided: cards.filter((card) => card.chosen !== null).length,
        },
        token: {
          mainHead,
          cutHead,
          mainRev: main.working.workingRev,
          cutRev: cut.working.workingRev,
        },
      };
    });
  });
}
