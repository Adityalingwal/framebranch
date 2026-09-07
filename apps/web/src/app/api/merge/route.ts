/**
 * POST /api/merge — the LANDING (F3(1), F4, F5, lock (3)).
 *
 * The preview computes and writes nothing; this endpoint is the one moment
 * anything is written, and it is ONE transaction:
 *
 *   lock both working rows (name order) → token check, BEFORE any write →
 *   seal both sides if dirty → recompute with the choices → the two-parent
 *   bring-in card → the event.
 *
 * Order is the whole design. The token check runs before the seals, so a
 * refusal leaves no auto card behind ("Cancel — nothing changes" is true of
 * a failed landing too); and because everything is one transaction, a later
 * throw (a decision still missing, an invalid final timeline) rolls the
 * seals back with it.
 */

import { loadBranchView } from "../../../server/branches";
import type { BranchView } from "../../../server/branches";
import { loadCommitRow } from "../../../server/commits";
import { ApiError } from "../../../server/envelope";
import { handleRequest, readBody } from "../../../server/handler";
import { finalizeMerge, loadMergeSides } from "../../../server/merge";
import { mergeBodySchema } from "../../../server/schemas";
import { sealIfDirty } from "../../../server/seal";
import { runWithTicket } from "../../../server/tickets";
import type { Tx } from "../../../server/tx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F4 + copy #151/#152 — the message is composed HERE, by the server, because
 * only the server knows who moved what. The client shows this text verbatim
 * for `E_STALE_HEAD` instead of its generic friendly line, and `details`
 * carries the same facts in machine form.
 *
 * `who` is the new head commit's author when the HEAD moved, and the working
 * row's last editor when only the rev moved (an edit does not move a head).
 * Unknown either way → the fallback sentence, which claims no name.
 */
async function assertFresh(
  tx: Tx,
  projectId: string,
  side: "main" | "cut",
  view: BranchView,
  cutName: string,
  expected: { head: string; rev: number },
): Promise<void> {
  const headMoved = view.branch.headCommitId !== expected.head;
  const revMoved = view.working.workingRev !== expected.rev;
  if (!headMoved && !revMoved) return;

  let who: string | null = null;
  if (headMoved) {
    const head = await loadCommitRow(tx, projectId, view.branch.headCommitId);
    who = head.actorName;
  } else {
    who = view.working.lastEditorName;
  }

  const message =
    side === "main"
      ? who
        ? `${who} changed main while you were working on this. Start the bring-in again to include their change.`
        : "main changed while you were working on this. Start again to include the change."
      : who
        ? `${who} changed "${cutName}" while you were working on this. Start again to include their change.`
        : `"${cutName}" changed while you were working on this. Start again to include the change.`;

  throw new ApiError("E_STALE_HEAD", message, { side, who });
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, async ({ db, project, editorName }) => {
    const body = await readBody(request, mergeBodySchema);

    // F1 (patched 2026-09-06) + F2a impl-note 4: Bring in lands on `main`
    // only. Rejected at the door — before any lock or seal — so a wrong
    // target never leaves a card behind.
    if (body.into !== "main") {
      throw new ApiError(
        "E_BAD_REQUEST",
        `Bring in only lands on "main" (got "${body.into}")`,
      );
    }

    return runWithTicket(db, project.id, "merge", body.ticket, async (tx) => {
      // Two branches are locked here, in a deterministic (name) order so
      // that two bring-ins running in opposite directions queue behind each
      // other instead of deadlocking.
      const order = [body.into, body.from].sort();
      const locked = new Map<string, BranchView>();
      for (const name of order) {
        locked.set(name, await loadBranchView(tx, project.id, name, true));
      }
      const mainView = locked.get(body.into)!;
      const cutView = locked.get(body.from)!;

      // F4 — BEFORE any write. `main` first, so a screen that is stale on
      // both sides names the one the user is standing on.
      await assertFresh(tx, project.id, "main", mainView, body.from, {
        head: body.token.mainHead,
        rev: body.token.mainRev,
      });
      await assertFresh(tx, project.id, "cut", cutView, body.from, {
        head: body.token.cutHead,
        rev: body.token.cutRev,
      });

      // The auto cards B4/C1 already produce, named by what changed. The
      // merge is computed from committed heads; unsealed pending work would
      // simply be absent from it.
      for (const name of order) {
        await sealIfDirty(tx, project.id, locked.get(name)!, editorName);
      }

      // Re-read AFTER the seals: the rows above are stale the moment a seal
      // moves a head.
      const into = await loadBranchView(tx, project.id, body.into, true);
      const from = await loadBranchView(tx, project.id, body.from, true);
      const headInto = into.branch.headCommitId;
      const headFrom = from.branch.headCommitId;

      // Sealed heads now — content-identical to the working timelines the
      // preview used, so the conflicts and their ids are the same ones the
      // choices answer.
      const sides = await loadMergeSides(tx, project.id, headInto, headFrom);
      return finalizeMerge({
        tx,
        projectId: project.id,
        into: into.branch,
        from: from.branch,
        working: into.working,
        headFrom,
        sides,
        choices: body.choices,
        actorName: editorName,
      });
    });
  });
}
