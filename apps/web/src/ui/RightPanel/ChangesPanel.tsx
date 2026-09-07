"use client";

import { useState } from "react";
import { Robot, User } from "@phosphor-icons/react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { NOW_SIDE } from "../../lib/data/api-client";
import type { CompareQuery } from "../../lib/data/hooks";
import { formatClock } from "../../lib/format";
import type { DiffRow } from "../../server/diff-rows";
import { CustomSelect } from "../CustomSelect";

/**
 * B2 §2.5 — the Compare view's right column: two pickers, the summary line,
 * one row per change (D4(1)).
 *
 * This panel owns NOTHING. The pair, the query, the highlight and the
 * player focus all live in the Shell, because the lanes in the centre read
 * the same state (§2.4). The presenter has already produced every string a
 * row shows (`clipName` / `text` / `where`, copy #113-#125) — the job here
 * is layout, hover and click.
 *
 * Rows above 20 are grouped under their track name (D4 impl-note): a flat
 * list of 30 rows loses the "what happened where" shape the lanes give.
 */

/** D4 impl-note — above this many rows the flat list stops being readable. */
const GROUP_ROWS_ABOVE = 20;

export function ChangesPanel({
  commits,
  pair,
  onPairChange,
  compare,
  highlightedClipIds,
  onHighlightClip,
  onRowClick,
}: {
  commits: HistoryCommit[];
  pair: { a: string; b: string } | null;
  onPairChange: (pair: { a: string; b: string }) => void;
  compare: CompareQuery;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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

      {pair === null && commits.length === 0 ? (
        // #106 — the honest fallback when there is nothing to pick at all.
        // D3a defaults the pair the moment the head is known, so in this
        // product History always has a card and this is unreachable.
        <Empty>Pick two versions to compare.</Empty>
      ) : compare.isError ? (
        <Empty>{"Couldn't load these changes."}</Empty>
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
          <div className="changes-rows">
            {groupRows(data.rows).map((group) => (
              <div key={group.trackName ?? "all"}>
                {group.trackName !== null && (
                  <div className="changes-group-head">{group.trackName}</div>
                )}
                {group.rows.map((row) => (
                  <Row
                    key={row.key}
                    row={row}
                    hot={isHot(row, highlightedClipIds)}
                    expanded={expanded.has(row.key)}
                    onToggleExpanded={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(row.key)) next.delete(row.key);
                        else next.add(row.key);
                        return next;
                      })
                    }
                    onHighlightClip={onHighlightClip}
                    onRowClick={onRowClick}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A row is lit when any clip it touches — on EITHER lane — is highlighted.
 * `laneIds`, never `clipIds`: hovering the second piece of a split in the
 * After lane must still light the row that made it (§2.6).
 */
function isHot(row: DiffRow, highlighted: string[]): boolean {
  if (highlighted.length === 0) return false;
  return (
    row.laneIds.before.some((id) => highlighted.includes(id)) ||
    row.laneIds.after.some((id) => highlighted.includes(id))
  );
}

function rowClipIds(row: DiffRow): string[] {
  return [...new Set([...row.laneIds.before, ...row.laneIds.after])];
}

type RowGroup = { trackName: string | null; rows: DiffRow[] };

/** ≤ 20 rows → one flat list, exactly the mockup. Above that, per track. */
function groupRows(rows: DiffRow[]): RowGroup[] {
  if (rows.length <= GROUP_ROWS_ABOVE) return [{ trackName: null, rows }];
  const groups: RowGroup[] = [];
  for (const row of rows) {
    const name = row.trackName || "Timeline";
    const last = groups.find((g) => g.trackName === name);
    if (last) last.rows.push(row);
    else groups.push({ trackName: name, rows: [row] });
  }
  return groups;
}

function Row({
  row,
  hot,
  expanded,
  onToggleExpanded,
  onHighlightClip,
  onRowClick,
}: {
  row: DiffRow;
  hot: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
}) {
  const ids = rowClipIds(row);
  return (
    <>
      <div
        className={`changes-row${hot ? " is-hot" : ""}`}
        role="button"
        tabIndex={0}
        onMouseEnter={() => onHighlightClip(ids)}
        onMouseLeave={() => onHighlightClip([])}
        onClick={() => onRowClick(row)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onRowClick(row);
        }}
      >
        <Thumb row={row} />
        <div className="changes-row-copy">
          <div className="changes-row-name">
            {row.clipName}
            {row.kind === "ripple" && (
              <button
                type="button"
                className="changes-row-toggle"
                aria-expanded={expanded}
                aria-label={expanded ? "Hide these clips" : "Show these clips"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleExpanded();
                }}
              >
                {expanded ? "▾" : "▸"}
              </button>
            )}
          </div>
          <div className="changes-row-what">{row.text}</div>
          {/* Property rows print no position — the line is left out, not
              rendered empty (#119-#121c have no `where`). */}
          {row.where !== "" && (
            <div className="changes-row-where">{row.where}</div>
          )}
        </div>
      </div>
      {/* #124b — the shifted clips, names only. */}
      {expanded &&
        row.children?.map((child) => (
          <div
            key={child.clipId}
            className="changes-row-child"
            onMouseEnter={() => onHighlightClip([child.clipId])}
            onMouseLeave={() => onHighlightClip([])}
          >
            {child.clipName}
          </div>
        ))}
    </>
  );
}

/** The mockup's 34×24 thumbnail, or a glyph when there is no media frame. */
function Thumb({ row }: { row: DiffRow }) {
  if (row.thumbnail) {
    return (
      <img className="changes-row-thumb" src={row.thumbnail} alt="" />
    );
  }
  const glyph =
    row.kind === "added"
      ? "+"
      : row.kind === "removed"
        ? "−"
        : row.kind === "ripple"
          ? "≡"
          : row.clipIds.length === 1
            ? "T" // a text clip: real content, just no frame to show
            : "▣";
  return (
    <span className={`changes-row-thumb is-glyph is-${row.kind}`} aria-hidden>
      {glyph}
    </span>
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
