"use client";

import { useState } from "react";

import type { DiffRow } from "../../server/diff-rows";

/**
 * DiffRows.tsx — the ONE row renderer, shared by the Changes panel and the
 * Bring-in panel (B3 §2.6). A row is the presenter's work already done
 * (`clipName` / `text` / `where`, copy #113-#125); this file is layout,
 * hover and click, plus the track grouping.
 *
 * Rows above 20 are grouped under their track name (D4 impl-note): a flat
 * list of 30 rows loses the "what happened where" shape the lanes give.
 */

/** D4 impl-note — above this many rows the flat list stops being readable. */
export const GROUP_ROWS_ABOVE = 20;

/**
 * A row is lit when any clip it touches — on EITHER lane — is highlighted.
 * `laneIds`, never `clipIds`: hovering the second piece of a split in the
 * After lane must still light the row that made it (B2 §2.6).
 */
export function isHot(row: DiffRow, highlighted: string[]): boolean {
  if (highlighted.length === 0) return false;
  return (
    row.laneIds.before.some((id) => highlighted.includes(id)) ||
    row.laneIds.after.some((id) => highlighted.includes(id))
  );
}

export function rowClipIds(row: DiffRow): string[] {
  return [...new Set([...row.laneIds.before, ...row.laneIds.after])];
}

type RowGroup = { trackName: string | null; rows: DiffRow[] };

/** ≤ 20 rows → one flat list, exactly the mockup. Above that, per track. */
export function groupRows(rows: DiffRow[]): RowGroup[] {
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

/** The whole list: grouping, the ripple rows' expand state, the rows. */
export function DiffRowList({
  rows,
  highlightedClipIds,
  onHighlightClip,
  onRowClick,
}: {
  rows: DiffRow[];
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  return (
    <div className="changes-rows">
      {groupRows(rows).map((group) => (
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
  );
}

export function Row({
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
export function Thumb({ row }: { row: DiffRow }) {
  if (row.thumbnail) {
    return <img className="changes-row-thumb" src={row.thumbnail} alt="" />;
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
