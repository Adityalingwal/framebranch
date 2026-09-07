/**
 * diff-rows.ts — the ONE shared diff presenter (D4 sub-locks 1, 4-10 + C5
 * Group 5). Engine `computeDiff` entries stay the machine truth; this file
 * turns them into the rows a human reads:
 *
 *   [thumbnail] ‹clip name› · ‹what happened› · ‹timecode›
 *
 * Used by: History `changes` counts, `GET /api/diff`, auto-card summary
 * names (B0); Compare UI, Bring-in preview and conflict cards later.
 *
 * Rules (copy sheet rows #109-#125, verbatim wording):
 * - positions, durations and runtime are ALWAYS 4-part `HH:MM:SS:FF`;
 *   trim/slip amounts are in frames (`by 3 frames`).
 * - "before/after ‹neighbour›" = the clip adjacent at the NEW position on
 *   the same track (stable ids); alone on the track → `Moved to ‹tc› (was ‹tc›)`.
 * - property rows: volume/opacity/scale/text show `before → after`;
 *   position/font/size/colour say `‹thing› changed` — a `textStyle` entry
 *   fans out into one row per sub-field that actually changed.
 * - raw: `mediaRefId` → `Media changed: ‹a› → ‹b›`, `track` → `Moved to
 *   track ‹name›`, anything else → `Changed — take a look`.
 * - RIPPLE (D4(9)): on one track, ≥2 consecutive clips all shifted by the
 *   same delta, immediately after a trimmed/added/removed clip on that
 *   track → ONE row `‹N› clips · Moved along after "‹cause›" · ‹tc› → ‹tc›
 *   (first)` with the N names as children. Grouping happens once, before
 *   counting. `count = rows.length`, always.
 * - a raw clip id is never shown (clipDisplayName).
 */

import { computeDiff } from "@framebranch/engine";
import type {
  DiffEntry,
  MediaRef,
  MovedEntry,
  PropertyChangedEntry,
  RawChangedEntry,
  TextStyle,
  Timeline,
  Track,
} from "@framebranch/engine";

import {
  clipDisplayName,
  isTextClip,
  thumbnailUrl,
  trackDisplayName,
  type AnyClip,
} from "../lib/clip-helpers";
import { formatFrames } from "../lib/format";

export type DiffRowKind =
  | "moved"
  | "trimmed"
  | "slipped"
  | "property"
  | "added"
  | "removed"
  | "split"
  | "raw"
  | "ripple";

export type DiffRow = {
  /** Stable per row: `‹clipId›:‹kind›[:‹sub›]`, or the ripple group id. */
  key: string;
  kind: DiffRowKind;
  /** 1 clip, or N for a ripple group (0 for track/timeline-scope raw rows). */
  clipIds: string[];
  /** Display name — never a raw id. Ripple: `‹N› clips`. */
  clipName: string;
  /** Media thumbnail URL, or null (text clips, ripple, non-clip rows). */
  thumbnail: string | null;
  /** The middle column, e.g. `Moved before "Interview"`. */
  text: string;
  /** The right column, e.g. `00:00:12:00 → 00:00:05:00`; may be empty. */
  where: string;
  trackId: string;
  trackName: string;
  /** Ripple only: the shifted clips, names only (copy #124b). */
  children?: { clipId: string; clipName: string }[];
};

export type DiffPresentation = {
  rows: DiffRow[];
  /** = rows.length, always (D4(10)). */
  count: number;
  /** Total length before → after, 4-part. */
  runtime: { before: string; after: string };
  /** C1(2) — the auto-card name. Empty when there are no rows. */
  summaryName: string;
};

/** C1(2): cap for the generated card name. */
export const SUMMARY_NAME_MAX = 60;

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

type Located = { clip: AnyClip; track: Track };

type Side = {
  timeline: Timeline;
  byId: Map<string, Located>;
  tracksById: Map<string, Track>;
};

function side(timeline: Timeline): Side {
  const byId = new Map<string, Located>();
  const tracksById = new Map<string, Track>();
  for (const track of timeline.tracks) {
    tracksById.set(track.id, track);
    for (const clip of track.clips as AnyClip[]) byId.set(clip.id, { clip, track });
  }
  return { timeline, byId, tracksById };
}

const start = (c: AnyClip): number => c.timelineRange.start.value;
const end = (c: AnyClip): number =>
  c.timelineRange.start.value + c.timelineRange.duration.value;

function sortedClips(track: Track | undefined): AnyClip[] {
  return [...((track?.clips ?? []) as AnyClip[])].sort(
    (a, b) => start(a) - start(b) || a.id.localeCompare(b.id),
  );
}

function mediaOf(tl: Timeline, clip: AnyClip): MediaRef | undefined {
  if (isTextClip(clip)) return undefined;
  return tl.mediaRefs.find((m) => m.id === clip.mediaRefId);
}

function lastClipEnd(tl: Timeline): number {
  let max = 0;
  for (const track of tl.tracks) {
    for (const clip of track.clips as AnyClip[]) max = Math.max(max, end(clip));
  }
  return max;
}

/** `/media/interview.mp4` → `interview.mp4` (copy #122: the filename). */
function fileName(url: string): string {
  return url.split("/").pop() ?? url;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// The presenter
// ---------------------------------------------------------------------------

export function presentDiff(
  before: Timeline,
  after: Timeline,
  entries: readonly DiffEntry[] = computeDiff(before, after).entries,
): DiffPresentation {
  const rate = after.projectRate;
  const tc = (frames: number): string => formatFrames(frames, rate);
  const a = side(before);
  const b = side(after);

  /** The clip as it is now, else as it was (removed clips). */
  const locate = (clipId: string): { loc: Located; tl: Timeline } | null => {
    const inB = b.byId.get(clipId);
    if (inB) return { loc: inB, tl: after };
    const inA = a.byId.get(clipId);
    if (inA) return { loc: inA, tl: before };
    return null;
  };
  const nameOf = (clipId: string): string => {
    const found = locate(clipId);
    if (!found) return "Untitled clip";
    return clipDisplayName(found.loc.clip, mediaOf(found.tl, found.loc.clip));
  };
  const thumbOf = (clipId: string): string | null => {
    const found = locate(clipId);
    if (!found) return null;
    const media = mediaOf(found.tl, found.loc.clip);
    return media ? thumbnailUrl(media.url) : null;
  };
  const trackNameOf = (trackId: string): string => {
    const inB = b.tracksById.get(trackId);
    if (inB) return trackDisplayName(inB, after);
    const inA = a.tracksById.get(trackId);
    if (inA) return trackDisplayName(inA, before);
    return trackId;
  };
  const quote = (clipId: string): string => `"${nameOf(clipId)}"`;

  const row = (
    entry: { trackId: string | null; clipId: string | null },
    kind: DiffRowKind,
    sub: string,
    text: string,
    where: string,
  ): DiffRow => {
    const clipId = entry.clipId;
    const trackId = entry.trackId ?? "";
    return {
      key: `${clipId ?? (trackId || "timeline")}:${kind}${sub ? `:${sub}` : ""}`,
      kind,
      clipIds: clipId ? [clipId] : [],
      clipName: clipId
        ? nameOf(clipId)
        : entry.trackId
          ? trackNameOf(entry.trackId)
          : "Timeline",
      thumbnail: clipId ? thumbOf(clipId) : null,
      text,
      where,
      trackId,
      trackName: entry.trackId ? trackNameOf(entry.trackId) : "",
    };
  };

  // Per-clip entry index (for ripple detection).
  const entriesByClip = new Map<string, DiffEntry[]>();
  for (const e of entries) {
    if (e.clipId === null) continue;
    const list = entriesByClip.get(e.clipId);
    if (list) list.push(e);
    else entriesByClip.set(e.clipId, [e]);
  }

  // --- ripple groups (computed first; their members' moved rows are folded) ---
  const rippled = new Set<string>(); // clipIds whose `moved` row is folded
  const rippleRowByFirst = new Map<string, DiffRow>(); // first member id → row

  const pureMoveDelta = (clipId: string): number | null => {
    const list = entriesByClip.get(clipId);
    if (!list || list.length !== 1 || list[0].kind !== "moved") return null;
    const m = list[0] as MovedEntry;
    return m.toStart - m.fromStart;
  };
  const hasKind = (clipId: string | undefined, kinds: DiffEntry["kind"][]) =>
    clipId !== undefined &&
    (entriesByClip.get(clipId) ?? []).some((e) => kinds.includes(e.kind));

  for (const track of after.tracks) {
    const inAfter = sortedClips(track);
    const inBefore = sortedClips(a.tracksById.get(track.id));
    let i = 0;
    while (i < inAfter.length) {
      const delta = pureMoveDelta(inAfter[i].id);
      if (delta === null) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < inAfter.length && pureMoveDelta(inAfter[j].id) === delta) j += 1;
      const run = inAfter.slice(i, j);
      if (run.length >= 2) {
        // The cause = the clip immediately before the run: in `after` for a
        // trim/add, in `before` for a removal.
        const prevAfter = i > 0 ? inAfter[i - 1].id : undefined;
        const beforeIndex = inBefore.findIndex((c) => c.id === run[0].id);
        const prevBefore =
          beforeIndex > 0 ? inBefore[beforeIndex - 1].id : undefined;
        const cause = hasKind(prevAfter, ["trimmed", "added"])
          ? prevAfter
          : hasKind(prevBefore, ["removed"])
            ? prevBefore
            : undefined;
        if (cause !== undefined) {
          const first = entriesByClip.get(run[0].id)![0] as MovedEntry;
          for (const c of run) rippled.add(c.id);
          rippleRowByFirst.set(run[0].id, {
            key: `ripple:${track.id}:${run[0].id}`,
            kind: "ripple",
            clipIds: run.map((c) => c.id),
            clipName: `${run.length} clips`,
            thumbnail: null,
            text: `Moved along after ${quote(cause)}`,
            where: `${tc(first.fromStart)} → ${tc(first.toStart)} (first)`,
            trackId: track.id,
            trackName: trackNameOf(track.id),
            children: run.map((c) => ({ clipId: c.id, clipName: nameOf(c.id) })),
          });
        }
      }
      i = j;
    }
  }

  // --- one row per entry, in engine order ---
  const rows: DiffRow[] = [];
  for (const e of entries) {
    switch (e.kind) {
      case "moved": {
        if (rippled.has(e.clipId)) {
          const group = rippleRowByFirst.get(e.clipId);
          if (group) rows.push(group); // placed where its first member sits
          break;
        }
        const track = b.tracksById.get(e.trackId);
        const order = sortedClips(track);
        const idx = order.findIndex((c) => c.id === e.clipId);
        const next = idx >= 0 ? order[idx + 1] : undefined;
        const prev = idx > 0 ? order[idx - 1] : undefined;
        const where = `${tc(e.fromStart)} → ${tc(e.toStart)}`;
        if (next) {
          rows.push(row(e, "moved", "", `Moved before ${quote(next.id)}`, where));
        } else if (prev) {
          rows.push(row(e, "moved", "", `Moved after ${quote(prev.id)}`, where));
        } else {
          rows.push(
            row(
              e,
              "moved",
              "",
              `Moved to ${tc(e.toStart)} (was ${tc(e.fromStart)})`,
              "",
            ),
          );
        }
        break;
      }
      case "trimmed": {
        const edge = e.edge === "start" ? "Start" : "End";
        const verb = e.change === "shortened" ? "trimmed" : "extended";
        const cur = b.byId.get(e.clipId)?.clip;
        const where = cur
          ? e.edge === "start"
            ? `now starts ${tc(start(cur))}`
            : `now ends ${tc(end(cur))}`
          : "";
        rows.push(
          row(
            e,
            "trimmed",
            e.edge,
            `${edge} ${verb} by ${plural(e.frames, "frame")}`,
            where,
          ),
        );
        break;
      }
      case "slipped": {
        const delta = e.toSourceStart - e.fromSourceStart;
        const cur = b.byId.get(e.clipId)?.clip;
        rows.push(
          row(
            e,
            "slipped",
            "",
            `Slipped ${plural(Math.abs(delta), "frame")} ${delta > 0 ? "later" : "earlier"}`,
            cur ? `stays at ${tc(start(cur))}` : "",
          ),
        );
        break;
      }
      case "propertyChanged":
        rows.push(...propertyRows(e, row));
        break;
      case "added": {
        const order = sortedClips(b.tracksById.get(e.trackId));
        const idx = order.findIndex((c) => c.id === e.clipId);
        const prev = idx > 0 ? order[idx - 1] : undefined;
        rows.push(
          row(
            e,
            "added",
            "",
            prev ? `Added after ${quote(prev.id)}` : "Added first",
            `at ${tc(e.start)} · ${tc(e.duration)}`,
          ),
        );
        break;
      }
      case "removed":
        rows.push(
          row(e, "removed", "", "Removed", `was at ${tc(e.start)} · ${tc(e.duration)}`),
        );
        break;
      case "split": {
        // `cuts` are root-local; the piece whose span starts at a cut sits at
        // the cut's timeline position.
        const pieces = e.pieceIds
          .map((id) => b.byId.get(id)?.clip)
          .filter((c): c is AnyClip => c !== undefined);
        const positions = e.cuts.map((cut) => {
          const piece = pieces.find((p) => p.lineage.span.start.value === cut);
          return tc(piece ? start(piece) : cut);
        });
        rows.push(
          row(
            e,
            "split",
            "",
            `Split into ${e.cuts.length + 1} clips`,
            `at ${positions.join(", ")}`,
          ),
        );
        break;
      }
      case "rawChanged":
        rows.push(rawRow(e, row, before, after, trackNameOf));
        break;
    }
  }

  disambiguateSameNames(rows);

  return {
    rows,
    count: rows.length,
    runtime: { before: tc(lastClipEnd(before)), after: tc(lastClipEnd(after)) },
    summaryName: summaryName(rows),
  };
}

type RowFn = (
  entry: { trackId: string | null; clipId: string | null },
  kind: DiffRowKind,
  sub: string,
  text: string,
  where: string,
) => DiffRow;

const pct = (v: number): string => `${Math.round(v * 100) / 100}%`;

function propertyRows(e: PropertyChangedEntry, row: RowFn): DiffRow[] {
  switch (e.property) {
    case "volume":
      return [row(e, "property", "volume", `Volume ${pct(e.before as number)} → ${pct(e.after as number)}`, "")];
    case "opacity":
      return [row(e, "property", "opacity", `Opacity ${pct(e.before as number)} → ${pct(e.after as number)}`, "")];
    case "scale":
      // Stored as a factor (1 = normal) → shown as percent (copy #119b).
      return [
        row(
          e,
          "property",
          "scale",
          `Scale ${pct((e.before as number) * 100)} → ${pct((e.after as number) * 100)}`,
          "",
        ),
      ];
    case "textContent":
      return [row(e, "property", "text", `Text: "${String(e.before)}" → "${String(e.after)}"`, "")];
    case "position":
      return [row(e, "property", "position", "Position changed", "")];
    case "textStyle": {
      // D4(7): one row per sub-field that actually changed; each counts as 1.
      const from = e.before as TextStyle;
      const to = e.after as TextStyle;
      const out: DiffRow[] = [];
      if (from.font !== to.font) out.push(row(e, "property", "font", "Text font changed", ""));
      if (from.size !== to.size) out.push(row(e, "property", "size", "Text size changed", ""));
      if (from.color !== to.color) out.push(row(e, "property", "colour", "Text colour changed", ""));
      // Defensive: an entry the engine emitted but whose fields all match
      // (cannot happen — eqStyle gates it) still counts once, honestly.
      if (out.length === 0) out.push(row(e, "property", "style", "Changed — take a look", ""));
      return out;
    }
  }
}

function rawRow(
  e: RawChangedEntry,
  row: RowFn,
  before: Timeline,
  after: Timeline,
  trackNameOf: (trackId: string) => string,
): DiffRow {
  if (e.scope === "clip" && e.field === "mediaRefId") {
    const url = (tl: Timeline, id: string) =>
      tl.mediaRefs.find((m) => m.id === id)?.url ?? id;
    return row(
      e,
      "raw",
      "media",
      `Media changed: ${fileName(url(before, e.before))} → ${fileName(url(after, e.after))}`,
      "",
    );
  }
  if (e.scope === "clip" && e.field === "track") {
    return row(
      { trackId: e.after, clipId: e.clipId },
      "raw",
      "track",
      `Moved to track ${trackNameOf(e.after)}`,
      "",
    );
  }
  // projectRate (C7 fixed), track existence/kind (H1), lineage/coverage,
  // unknown fields: the honest catch-all. Machine field names never shown.
  return row(e, "raw", e.field, "Changed — take a look", "");
}

/**
 * Two different clips with the same display name on one track (e.g. two
 * B-roll clips from the same media) are told apart INSIDE this row list
 * only: the 2nd distinct clip (by first appearance) gets ` (2nd)`, the 3rd
 * ` (3rd)`, … Rows of the same clip share the suffix. Ripple/multi-clip
 * rows are left alone (their `clipName` is a count).
 */
function disambiguateSameNames(rows: DiffRow[]): void {
  const seen = new Map<string, string[]>(); // `${trackId} ${name}` → clipIds in order
  for (const r of rows) {
    if (r.clipIds.length !== 1) continue;
    const key = `${r.trackId} ${r.clipName}`;
    const ids = seen.get(key) ?? [];
    if (!ids.includes(r.clipIds[0])) ids.push(r.clipIds[0]);
    seen.set(key, ids);
  }
  for (const r of rows) {
    if (r.clipIds.length !== 1) continue;
    const ids = seen.get(`${r.trackId} ${r.clipName}`) ?? [];
    const n = ids.indexOf(r.clipIds[0]) + 1;
    if (n >= 2) r.clipName = `${r.clipName} (${ordinal(n)})`;
  }
}

function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  const suffix =
    rem10 === 1 && rem100 !== 11
      ? "st"
      : rem10 === 2 && rem100 !== 12
        ? "nd"
        : rem10 === 3 && rem100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/**
 * C1(2) / G4-N — the auto-card name from the rows:
 *   `‹N› clips moved, ‹N› trimmed, ‹N› slipped, ‹N› added, ‹N› removed,
 *    ‹N› split, ‹N› changed` — non-zero parts only, this order, the FIRST
 *    part carries the word `clip(s)`; each ripple row adds `‹N› clips moved
 *    along` at the end. Exactly one row → that row's own text
 *    (`Interview end trimmed by 18 frames`). Capped at 60 chars with `…`.
 */
export function summaryName(rows: readonly DiffRow[]): string {
  if (rows.length === 0) return "";
  if (rows.length === 1) {
    const r = rows[0];
    return cap(`${r.clipName} ${lowerFirst(r.text)}`);
  }
  const order: [DiffRowKind[], string][] = [
    [["moved"], "moved"],
    [["trimmed"], "trimmed"],
    [["slipped"], "slipped"],
    [["added"], "added"],
    [["removed"], "removed"],
    [["split"], "split"],
    [["property", "raw"], "changed"],
  ];
  const parts: string[] = [];
  for (const [kinds, verb] of order) {
    const n = rows.filter((r) => kinds.includes(r.kind)).length;
    if (n === 0) continue;
    parts.push(parts.length === 0 ? `${plural(n, "clip")} ${verb}` : `${n} ${verb}`);
  }
  for (const r of rows) {
    if (r.kind === "ripple") parts.push(`${r.clipIds.length} clips moved along`);
  }
  return cap(parts.join(", "));
}

function cap(s: string): string {
  return s.length > SUMMARY_NAME_MAX ? `${s.slice(0, SUMMARY_NAME_MAX - 1).trimEnd()}…` : s;
}
