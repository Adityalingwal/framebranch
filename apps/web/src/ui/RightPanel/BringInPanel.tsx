"use client";

import type { MergeChoice } from "@framebranch/engine";

import { ApiClientError } from "../../lib/data/api-client";
import type { BringInPreviewQuery } from "../../lib/data/hooks";
import { quoted } from "../../lib/format";
import type { ConflictCard, ConflictLine } from "../../server/conflict-cards";
import type { DiffRow } from "../../server/diff-rows";
import { DiffRowList } from "./DiffRows";

/**
 * BringInPanel — the right column of the Bring-in preview (F3(1), (2), (5);
 * F4; F5; lock (4)(iii); copy #131, #134-#160).
 *
 * Top to bottom: the header, the summary, `Decide these first` with one card
 * per conflict, the remaining rows, and a sticky footer with the two
 * controls. No pickers: the two points are not a choice here — this is main
 * now against main with this cut in it.
 *
 * The panel owns NOTHING. Every decision goes up to the Shell, which stores
 * it and re-asks the (stateless) preview; the card's pressed button, the
 * counts, the rows, the summary and the After lane all come back from that
 * ONE answer.
 */
export function BringInPanel({
  cut,
  preview,
  landPending,
  landError,
  onChoice,
  onLand,
  onCancel,
  onStartAgain,
  highlightedClipIds,
  onHighlightClip,
  onRowClick,
  onLineClick,
}: {
  cut: string;
  preview: BringInPreviewQuery;
  landPending: boolean;
  /** The landing's refusal, or null. The two the panel renders itself. */
  landError: unknown;
  onChoice: (conflictId: string, choice: MergeChoice) => void;
  onLand: () => void;
  onCancel: () => void;
  onStartAgain: () => void;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
  onLineClick: (line: ConflictLine) => void;
}) {
  const data = preview.data;
  const patti = pattiFor(landError, cut);
  const left = data ? data.counts.total - data.counts.decided : 0;

  return (
    <div className="changes-panel bring-in-panel">
      {/* #131 — the action about to happen, in the C4 one-liner's own words.
          The tab strip above still shows Changes selected, and the panel's
          own <h2> still says `Changes`: this is a door into that view, not a
          fourth tab. */}
      <h3 className="bring-in-header">{`Bring ${quoted(cut)} into main`}</h3>
      {/* #133 (Ready · ‹who› · ‹time› · "‹note›") is B4's line; it goes here. */}

      {patti && (
        // F4 / lock (3) — the ONE place drift is caught. The sentence is the
        // server's own (it knows who moved what); `Start again` refetches on
        // this same screen, so nothing is lost but the decisions F4 says are
        // re-asked.
        <div className="bring-in-patti" role="alert">
          <span>{patti}</span>
          <button
            type="button"
            className="bring-in-patti-action"
            onClick={onStartAgain}
          >
            Start again
          </button>
        </div>
      )}

      {preview.isError ? (
        // #135 — the same `Start again` control refetches.
        <div className="changes-empty">
          <div>{"Couldn't prepare this. Try again."}</div>
          <button
            type="button"
            className="bring-in-patti-action"
            onClick={onStartAgain}
          >
            Start again
          </button>
        </div>
      ) : !data ? (
        // #135 — only the FIRST answer shows this; later refetches keep the
        // previous content on screen (keepPreviousData).
        <div className="changes-empty">Preparing…</div>
      ) : (
        <>
          <div className={`bring-in-body${patti ? " is-dimmed" : ""}`}>
            {/* #134, and #108's words when there is nothing at all to show. */}
            {data.count === 0 && data.conflicts.length === 0 ? (
              <div className="changes-empty">No changes</div>
            ) : (
              <div className="changes-summary">
                <span className="changes-summary-count">
                  {data.count} {data.count === 1 ? "change" : "changes"}
                </span>
                <span className="changes-summary-runtime">
                  · runtime {data.runtime.before} → {data.runtime.after}
                </span>
              </div>
            )}

            {data.conflicts.length > 0 && (
              <>
                {/* #136 */}
                <div className="bring-in-decide-head">Decide these first</div>
                {data.conflicts.map((card) => (
                  <Card
                    key={card.conflictId}
                    card={card}
                    highlightedClipIds={highlightedClipIds}
                    onHighlightClip={onHighlightClip}
                    onLineClick={onLineClick}
                    onChoice={onChoice}
                  />
                ))}
              </>
            )}

            {data.rows.length > 0 && (
              <DiffRowList
                rows={data.rows}
                highlightedClipIds={highlightedClipIds}
                onHighlightClip={onHighlightClip}
                onRowClick={onRowClick}
              />
            )}
          </div>

          {/* #146 / #148 — the footer follows the panel's scroll. */}
          <div className="bring-in-footer">
            <span className="bring-in-left">
              {left > 0
                ? `${left} ${left === 1 ? "decision" : "decisions"} left`
                : ""}
            </span>
            <span className="bring-in-actions">
              <button
                type="button"
                className="bring-in-cancel"
                onClick={onCancel}
                disabled={landPending}
              >
                Cancel — nothing changes
              </button>
              <button
                type="button"
                className="bring-in-land"
                // Nothing may land while a decision is missing, while the
                // answer is in flight or stale, or while the last attempt is
                // still going.
                disabled={
                  left > 0 ||
                  preview.isFetching ||
                  landPending ||
                  patti !== null
                }
                onClick={onLand}
              >
                Bring in now
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * #151/#152 verbatim from the server (only it knows who moved what), or
 * #159 for the engine's precondition. Every other failure is a toast, from
 * the shared handler.
 */
function pattiFor(error: unknown, cut: string): string | null {
  if (!(error instanceof ApiClientError)) return null;
  if (error.code === "E_STALE_HEAD") return error.serverMessage;
  if (error.code === "E_MERGE_PRECONDITION") {
    return `Couldn't finish bringing in ${quoted(cut)}. Start again.`;
  }
  return null;
}

function Card({
  card,
  highlightedClipIds,
  onHighlightClip,
  onLineClick,
  onChoice,
}: {
  card: ConflictCard;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onLineClick: (line: ConflictLine) => void;
  onChoice: (conflictId: string, choice: MergeChoice) => void;
}) {
  return (
    <div className="bring-in-card">
      <div className="bring-in-card-title">{card.title}</div>
      {card.lines.map((line, index) => {
        const ids = [...new Set([...line.laneIds.before, ...line.laneIds.after])];
        const inert = line.jump === null && ids.length === 0;
        const hot = ids.some((id) => highlightedClipIds.includes(id));
        return (
          <div
            key={`${card.conflictId}:${index}`}
            className={`bring-in-line is-${line.side}${hot ? " is-hot" : ""}${
              inert ? " is-inert" : ""
            }`}
            {...(inert
              ? {}
              : {
                  role: "button" as const,
                  tabIndex: 0,
                  onMouseEnter: () => onHighlightClip(ids),
                  onMouseLeave: () => onHighlightClip([]),
                  onClick: () => onLineClick(line),
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onLineClick(line);
                  },
                })}
          >
            <LineThumb line={line} />
            {/* ONE inline run, so the line really reads `main · "…"` in the
                page's text (#138/#141/#144) — the separator is a text node,
                not a CSS `::before` nobody can read or copy. No dot when the
                value is empty (position / text style: look in the player). */}
            <span className="bring-in-line-text">
              <span className="bring-in-line-label">{line.label}</span>
              {line.value !== "" && (
                <>
                  <span className="bring-in-line-sep">{" · "}</span>
                  <span className="bring-in-line-value">{line.value}</span>
                </>
              )}
            </span>
          </div>
        );
      })}
      <div className="bring-in-buttons">
        {card.buttons.map((button) => (
          <button
            key={button.choice}
            type="button"
            // #149 — the chosen one stays pressed; clicking another
            // re-answers (the engine allows it, and so does the store).
            className={`bring-in-choice${
              card.chosen === button.choice ? " is-chosen" : ""
            }`}
            aria-pressed={card.chosen === button.choice}
            onClick={() => onChoice(card.conflictId, button.choice)}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The rows' own thumbnail treatment: a frame, or the text glyph. */
function LineThumb({ line }: { line: ConflictLine }) {
  if (line.thumbnail) {
    return <img className="changes-row-thumb" src={line.thumbnail} alt="" />;
  }
  return (
    <span className="changes-row-thumb is-glyph is-property" aria-hidden>
      T
    </span>
  );
}
