"use client";

import { Robot, User } from "@phosphor-icons/react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { NOW_SIDE } from "../../lib/data/api-client";
import type { CompareQuery } from "../../lib/data/hooks";
import { formatClock } from "../../lib/format";
import type { DiffRow } from "../../server/diff-rows";
import { CustomSelect } from "../CustomSelect";
import { DiffRowList } from "./DiffRows";

/**
 * B2 §2.5 — the Compare view's right column: two pickers, the summary line,
 * one row per change (D4(1)).
 *
 * This panel owns NOTHING. The pair, the query, the highlight and the
 * player focus all live in the Shell, because the lanes in the centre read
 * the same state (§2.4). The rows themselves are rendered by the shared
 * `DiffRowList` (B3 §2.6) — the Bring-in panel prints the same rows.
 */

export function ChangesPanel({
  commits,
  pair,
  onPairChange,
  historyEmpty,
  compare,
  highlightedClipIds,
  onHighlightClip,
  onRowClick,
}: {
  commits: HistoryCommit[];
  pair: { a: string; b: string } | null;
  onPairChange: (pair: { a: string; b: string }) => void;
  /** History has answered and holds no card (cannot happen in this product). */
  historyEmpty: boolean;
  compare: CompareQuery;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
}) {
  const options = versionOptions(commits);
  const data = compare.data;

  return (
    <div className="changes-panel">
      {/* #100 — ONE line. `From`/`To` would lie: the view always reads
          older → newer whichever way the two are picked (D4(12)). */}
      <div className="changes-pickers">
        <span>Compare</span>
        <CustomSelect
          value={pair?.a ?? ""}
          placeholder="Choose a version…"
          ariaLabel="First version to compare"
          className="panel-select"
          options={options}
          onChange={(a) => onPairChange({ a, b: pair?.b ?? NOW_SIDE })}
        />
        <span>with</span>
        <CustomSelect
          value={pair?.b ?? ""}
          placeholder="Choose a version…"
          ariaLabel="Second version to compare"
          className="panel-select"
          options={options}
          onChange={(b) => onPairChange({ a: pair?.a ?? NOW_SIDE, b })}
        />
      </div>

      {compare.isError ? (
        <Empty>{"Couldn't load these changes."}</Empty>
      ) : pair === null && historyEmpty ? (
        // #106 — the honest fallback when there is nothing to pick at all:
        // History has SETTLED and is empty. D3a defaults the pair the moment
        // the head is known and History always has a card, so in this
        // product this is unreachable — it must never show while loading.
        <Empty>Pick two versions to compare.</Empty>
      ) : !data ? (
        // #107 — includes the moment after a reload on `?view=changes`,
        // when the head (and so the default pair) is not known yet.
        <Empty>Comparing…</Empty>
      ) : data.count === 0 ? (
        // #108 — the same words as the chip, and nothing else on screen.
        <Empty>No changes</Empty>
      ) : (
        <>
          {/* #109 / D4(10) — N is the ROW count (a ripple is one row). */}
          <div className="changes-summary">
            <span className="changes-summary-count">
              {data.count} {data.count === 1 ? "change" : "changes"}
            </span>
            <span className="changes-summary-runtime">
              · runtime {data.runtime.before} → {data.runtime.after}
            </span>
          </div>
          <DiffRowList
            rows={data.rows}
            highlightedClipIds={highlightedClipIds}
            onHighlightClip={onHighlightClip}
            onRowClick={onRowClick}
          />
        </>
      )}
    </div>
  );
}

/**
 * D3b (#101, #102) — `Now` on top, then this cut's History chain in its own
 * order, auto cards included and NOT folded. The description is the card's
 * meta: `‹who› · ‹time›`, or just the time where there is no who (the seed
 * card's "Start" is not a person; a brought-in card names no one either).
 */
function versionOptions(commits: HistoryCommit[]) {
  return [
    { value: NOW_SIDE, label: "Now" },
    ...commits.map((commit) => {
      const who =
        commit.kind === "agent-run" ? "Agent" : (commit.actorName ?? null);
      const time = formatClock(commit.createdAt);
      return {
        value: commit.commitId,
        label: commit.name,
        description: who ? `${who} · ${time}` : time,
        icon:
          commit.kind === "agent-run" ? (
            <Robot size={15} weight="duotone" aria-hidden />
          ) : (
            <User size={15} weight="duotone" aria-hidden />
          ),
      };
    }),
  ];
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="changes-empty">{children}</div>;
}
