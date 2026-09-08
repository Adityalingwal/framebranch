/**
 * conflict-cards.ts — the Bring-in preview's conflict presenter (F3(2),
 * F2b/F2c/F2e, B3 lock (5) + C5 rows #137-#145).
 *
 * The engine's `MergeConflict` is machine truth: a bucket, a set of
 * participant ids and an `explanation` written for a log. This file turns
 * one conflict into the card a human decides:
 *
 *   title      — what collided, in the row vocabulary (`"Welcome" — both
 *                cuts changed the text`)
 *   lines      — one per side: `main` / the cut's name / `Original`, each
 *                with a thumbnail and the REAL content (F2b/F2c)
 *   buttons    — the two or three answers, labelled by cut name (never
 *                yours/theirs/agent's)
 *
 * Rules that are not negotiable:
 * - the engine's `explanation` is NEVER copied into any field (F2e);
 * - a raw clip id is never shown (`clipDisplayName`, like the rows);
 * - every timecode is the 4-part `HH:MM:SS:FF` (`formatFrames`);
 * - `laneIds` / `jump` follow D4's row rule (F3(3)): hovering a line rings
 *   the clip in the lanes, clicking it sends the player there. The
 *   `Original` line is inert — no lane holds the Original.
 *
 * Pure: timelines + engine conflicts in, cards out. No DB, no React.
 */

import type { MergeChoice, MergeConflict, Timeline } from "@framebranch/engine";

import {
  clipDisplayName,
  isTextClip,
  thumbnailUrl,
  trackDisplayName,
  type AnyClip,
} from "../lib/clip-helpers";
import { formatFrames, quoted } from "../lib/format";
import { presentDiff } from "./diff-rows";
import type { DiffRow } from "./diff-rows";

/**
 * The engine's own defaults, mirrored here. `PROPERTY_DEFAULTS` is internal
 * to the verbs; a card reads properties straight off a clip, so it needs the
 * same fallbacks the engine writes with (a clip that was never touched has
 * no `volume` key at all).
 */
const PROPERTY_DEFAULTS = { volume: 100, opacity: 100, scale: 1 } as const;

export type ConflictSide = "main" | "cut" | "original";

export type ConflictLine = {
  side: ConflictSide;
  /** `main` · the cut's name · `Original` (bucket 3: the clip's name, #144). */
  label: string;
  clipId: string | null;
  /** Display name — never an id. */
  clipName: string;
  thumbnail: string | null;
  /** The right-hand text; may be "" (position / text style — look in the player). */
  value: string;
  /** Hover → these clips ring in the lanes. */
  laneIds: { before: string[]; after: string[] };
  /** Click → the player goes here. `null` = inert (the Original line always). */
  jump: { side: "before" | "after"; frame: number } | null;
};

export type ConflictCard = {
  conflictId: string;
  bucket: 1 | 2 | 3;
  title: string;
  lines: ConflictLine[];
  buttons: { label: string; choice: MergeChoice }[];
  chosen: MergeChoice | null;
};

/**
 * One conflict plus the composed draft it was OPEN in
 * (`MergeSuccess.composed ?? MergeSuccess.timeline` of that engine run).
 *
 * Per conflict, not per preview: an answered overlap no longer exists in the
 * current run (its clips have been shifted or reverted), so the only draft
 * that still shows where its two clips collided is the run that reported it.
 * Bucket 3 reads positions and provenance from there; buckets 1 and 2 ignore
 * it.
 */
export type ConflictRecord = {
  conflict: MergeConflict;
  composed: Timeline;
};

export type ConflictCardsInput = {
  /** Original — the merge base's timeline (F2b). */
  base: Timeline;
  /** `main`'s working timeline (the Before lane). */
  ours: Timeline;
  /** The cut's working timeline. */
  theirs: Timeline;
  /** The After lane exactly as the preview will draw it (undecided clips included). */
  after: Timeline;
  /** The cut being brought in — every button and side label says its name. */
  cutName: string;
  /** Every conflict this preview knows about, in the order the cards appear. */
  conflicts: readonly ConflictRecord[];
  /** The answers so far; a card's `chosen` is looked up here. */
  choices: Readonly<Record<string, MergeChoice>>;
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

type Located = { clip: AnyClip; trackId: string };

function index(timeline: Timeline): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips as AnyClip[]) {
      map.set(clip.id, { clip, trackId: track.id });
    }
  }
  return map;
}

const startOf = (clip: AnyClip): number => clip.timelineRange.start.value;
const endOf = (clip: AnyClip): number =>
  clip.timelineRange.start.value + clip.timelineRange.duration.value;

function nameOf(timeline: Timeline, clip: AnyClip): string {
  const media = isTextClip(clip)
    ? undefined
    : timeline.mediaRefs.find((m) => m.id === clip.mediaRefId);
  const display = clipDisplayName(clip, media);
  // Copy #125, as in the rows: an unnamed TEXT clip shows its content in
  // quotes, so a title never reads as if the text were the clip's name.
  const own = clip.name?.trim();
  if (!own && isTextClip(clip) && clip.textContent.trim().length > 0) {
    return `"${display}"`;
  }
  return display;
}

function thumbOf(timeline: Timeline, clip: AnyClip): string | null {
  if (isTextClip(clip)) return null;
  const media = timeline.mediaRefs.find((m) => m.id === clip.mediaRefId);
  return media ? thumbnailUrl(media.url) : null;
}

/** Every id belonging to one lineage family, across all three sides. */
function familyIds(
  rootId: string,
  timelines: readonly Timeline[],
): Set<string> {
  const ids = new Set<string>();
  for (const timeline of timelines) {
    for (const track of timeline.tracks) {
      for (const clip of track.clips as AnyClip[]) {
        if (clip.lineage.rootId === rootId) ids.add(clip.id);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Bucket 1 — the same thing changed differently (copy #137-#139)
// ---------------------------------------------------------------------------

/** #137 / #137a-#137i — one title per engine field. */
function valueTitlePhrase(field: string): string {
  switch (field) {
    case "text-content":
      return "both cuts changed the text";
    case "volume":
      return "both cuts changed the volume";
    case "opacity":
      return "both cuts changed the opacity";
    case "scale":
      return "both cuts changed the scale";
    case "position":
      return "both cuts changed the position";
    case "text-style":
      return "both cuts changed the text style";
    case "timeline-offset":
      return "both cuts moved it";
    case "source-offset":
      return "both cuts slipped it";
    case "coverage-start":
    case "coverage-end":
      return "both cuts trimmed it";
    default:
      // #137i — `source-bounds`, `negative-start`, `nonpositive-duration`
      // and anything the engine adds later.
      return "both cuts changed it";
  }
}

const pct = (value: number): string => `${Math.round(value * 100) / 100}%`;

function property(clip: AnyClip, key: "volume" | "opacity" | "scale"): number {
  if (isTextClip(clip)) {
    return key === "opacity"
      ? (clip.properties?.opacity ?? PROPERTY_DEFAULTS.opacity)
      : PROPERTY_DEFAULTS[key];
  }
  return clip.properties[key] ?? PROPERTY_DEFAULTS[key];
}

/**
 * #138 — the right-hand text of one bucket-1 line, in the Compare rows'
 * vocabulary (#119-#121). `position`, `text style` and the #137i fallback
 * deliberately print nothing: the thumbnail and the player carry those.
 */
function valueFor(
  field: string,
  clip: AnyClip,
  baseClip: AnyClip | undefined,
  side: ConflictSide,
  rate: number,
): string {
  const tc = (frames: number) => formatFrames(frames, rate);
  switch (field) {
    case "text-content":
      return isTextClip(clip) ? `"${clip.textContent}"` : "";
    case "volume":
      return `Volume ${pct(property(clip, "volume"))}`;
    case "opacity":
      return `Opacity ${pct(property(clip, "opacity"))}`;
    case "scale":
      return `Scale ${pct(property(clip, "scale") * 100)}`;
    case "timeline-offset":
      return `at ${tc(startOf(clip))}`;
    case "source-offset": {
      if (isTextClip(clip)) return "";
      // The Original is the reference point every side is measured against,
      // so it prints the source position itself, not a delta of zero.
      if (side === "original" || !baseClip || isTextClip(baseClip)) {
        return `starts ${tc(clip.sourceRange.start.value)}`;
      }
      const delta =
        clip.sourceRange.start.value - baseClip.sourceRange.start.value;
      if (delta === 0) return `starts ${tc(clip.sourceRange.start.value)}`;
      const frames = Math.abs(delta);
      return `starts ${frames} frame${frames === 1 ? "" : "s"} ${
        delta > 0 ? "later" : "earlier"
      }`;
    }
    case "coverage-end":
      // #137h — the D4(4) Trimmed words; the Original line drops the `now`.
      return side === "original"
        ? `ends ${tc(endOf(clip))}`
        : `now ends ${tc(endOf(clip))}`;
    case "coverage-start":
      return side === "original"
        ? `starts ${tc(startOf(clip))}`
        : `now starts ${tc(startOf(clip))}`;
    default:
      // position · text-style · #137i — thumbnail only.
      return "";
  }
}

// ---------------------------------------------------------------------------
// Bucket 2 — one side removed it, the other changed it (copy #140-#142)
// ---------------------------------------------------------------------------

/**
 * #140b-#140f — what the keeper did to the clip, as the tail of the title.
 * Read off the SHARED presenter's rows (base → that side), so the card and
 * the Compare rows can never describe the same edit with different words.
 */
function keeperPhrase(row: DiffRow | undefined): string {
  if (!row) return "changed it";
  switch (row.kind) {
    case "moved":
      return "moved it";
    case "trimmed":
      return "trimmed it";
    case "slipped":
      return "slipped it";
    case "split":
      return "split it";
    case "property": {
      const sub = row.key.split(":")[2] ?? "";
      if (sub === "text") return "changed the text";
      if (sub === "volume" || sub === "opacity" || sub === "scale") {
        return `changed the ${sub}`;
      }
      if (sub === "position") return "changed the position";
      // font / size / colour are three rows of ONE text style (#140f).
      if (sub === "font" || sub === "size" || sub === "colour") {
        return "changed the text style";
      }
      return "changed it";
    }
    default:
      // added / removed / raw / ripple — nothing #140 has words for.
      return "changed it";
  }
}

/** #141 — the keeper's line value: `Moved to ‹tc›`, else the row's own text. */
function keeperValue(
  row: DiffRow | undefined,
  clip: AnyClip | undefined,
  rate: number,
): string {
  if (row?.kind === "moved" && clip) {
    return `Moved to ${formatFrames(startOf(clip), rate)}`;
  }
  return row?.text ?? "Changed";
}

// ---------------------------------------------------------------------------
// The After lane the cards are described against (lock (4)(ii))
// ---------------------------------------------------------------------------

/**
 * The engine OMITS every clip of an unanswered conflict from the merged
 * timeline — showing that as "After" would be a lie ("your clip vanished"),
 * so the preview draws those clips where MAIN has them, striped.
 *
 * ONLY from `ours`: a participant main does not have (bucket 2 where main
 * removed it; the cut-side clip of an overlap) stays absent until the user
 * decides — the cut's version is never drawn as if it were already in.
 *
 * Display-only. The result is never committed and never checked against the
 * engine's invariants; `POST /api/merge` recomputes from the real inputs.
 */
export function buildAfterDisplay(
  merged: Timeline,
  ours: Timeline,
  undecided: readonly MergeConflict[],
): { after: Timeline; undecidedClipIds: string[] } {
  const inMerged = index(merged);
  const inOurs = index(ours);
  const undecidedClipIds: string[] = [];
  const toInsert: { clip: AnyClip; trackId: string }[] = [];

  for (const conflict of undecided) {
    for (const clipId of conflict.participants.clipIds) {
      if (inMerged.has(clipId)) {
        // The engine kept it (an overlap's two clips are IN the merged
        // timeline — that is how it saw them collide).
        if (!undecidedClipIds.includes(clipId)) undecidedClipIds.push(clipId);
        continue;
      }
      const mine = inOurs.get(clipId);
      if (!mine) continue; // main does not have it → it stays absent
      if (!undecidedClipIds.includes(clipId)) undecidedClipIds.push(clipId);
      toInsert.push({ clip: mine.clip, trackId: mine.trackId });
    }
  }

  if (toInsert.length === 0) {
    return { after: merged, undecidedClipIds };
  }

  const tracks = merged.tracks.map((track) => ({
    ...track,
    clips: [...track.clips] as AnyClip[],
  }));
  for (const { clip, trackId } of toInsert) {
    let track = tracks.find((t) => t.id === trackId);
    if (!track) {
      // The merged timeline lost the whole track (every clip on it was
      // withheld). Rebuild the shell from main's own track.
      const source = ours.tracks.find((t) => t.id === trackId);
      if (!source) continue;
      track = { ...source, clips: [] as AnyClip[] };
      tracks.push(track);
    }
    track.clips.push(clip);
  }
  for (const track of tracks) {
    track.clips.sort(
      (a, b) => startOf(a) - startOf(b) || a.id.localeCompare(b.id),
    );
  }
  return {
    after: { ...merged, tracks: tracks as Timeline["tracks"] },
    undecidedClipIds,
  };
}

// ---------------------------------------------------------------------------
// The presenter
// ---------------------------------------------------------------------------

export function presentConflictCards(
  input: ConflictCardsInput,
): ConflictCard[] {
  const { base, ours, theirs, after, cutName, conflicts, choices } = input;
  const rate = ours.projectRate;
  const sides = {
    base: index(base),
    ours: index(ours),
    theirs: index(theirs),
    after: index(after),
  };

  // Only bucket 2 needs these, and only for the side that KEPT the clip —
  // computed at most once each.
  let baseToOurs: DiffRow[] | null = null;
  let baseToTheirs: DiffRow[] | null = null;
  const rowsAgainstBase = (which: "ours" | "theirs"): DiffRow[] => {
    if (which === "ours") {
      baseToOurs ??= presentDiff(base, ours).rows;
      return baseToOurs;
    }
    baseToTheirs ??= presentDiff(base, theirs).rows;
    return baseToTheirs;
  };

  /**
   * F3(3) = D4's rule. The `main` line points at the Before lane (and at the
   * After lane too when the clip survives there); the cut's line only ever
   * points at the After lane, because no lane shows the cut on its own.
   */
  function laneFor(
    side: "main" | "cut",
    clipId: string | null,
  ): Pick<ConflictLine, "laneIds" | "jump"> {
    if (clipId === null) return { laneIds: { before: [], after: [] }, jump: null };
    const inOurs = sides.ours.get(clipId);
    const inAfter = sides.after.get(clipId);
    const before = side === "main" && inOurs ? [clipId] : [];
    const afterIds = inAfter ? [clipId] : [];
    if (before.length > 0) {
      return {
        laneIds: { before, after: afterIds },
        jump: { side: "before", frame: startOf(inOurs!.clip) },
      };
    }
    if (afterIds.length > 0) {
      return {
        laneIds: { before, after: afterIds },
        jump: { side: "after", frame: startOf(inAfter!.clip) },
      };
    }
    // Undecided and absent from main: nothing to ring, nowhere to jump.
    return { laneIds: { before: [], after: [] }, jump: null };
  }

  function line(
    side: ConflictSide,
    label: string,
    timeline: Timeline,
    clip: AnyClip | undefined,
    value: string,
    overrides: Partial<Pick<ConflictLine, "label" | "laneIds" | "jump">> = {},
  ): ConflictLine {
    const lane =
      side === "original" || !clip
        ? { laneIds: { before: [], after: [] }, jump: null }
        : laneFor(side, clip.id);
    return {
      side,
      label: overrides.label ?? label,
      clipId: clip?.id ?? null,
      clipName: clip ? nameOf(timeline, clip) : "",
      thumbnail: clip ? thumbOf(timeline, clip) : null,
      value,
      laneIds: overrides.laneIds ?? lane.laneIds,
      jump: overrides.jump ?? lane.jump,
    };
  }

  const cards: ConflictCard[] = [];

  for (const record of conflicts) {
    const conflict = record.conflict;
    const chosen = choices[conflict.conflictId] ?? null;
    const participants = conflict.participants;

    if (participants.kind === "value") {
      const ids = participants.clipIds;
      const pick = (map: Map<string, Located>): AnyClip | undefined => {
        for (const id of ids) {
          const found = map.get(id);
          if (found) return found.clip;
        }
        return undefined;
      };
      const oursClip = pick(sides.ours);
      const theirsClip = pick(sides.theirs);
      const baseClip = pick(sides.base);
      // The title names the clip by the ORIGINAL: an unnamed text clip is
      // shown as its own content (#125), and that content is exactly what
      // differs here — naming it from main's side would put main's answer
      // in the question.
      const named = baseClip ?? oursClip ?? theirsClip;
      const namedIn = baseClip ? base : oursClip ? ours : theirs;
      const title = `${named ? quoted(nameOf(namedIn, named)) : "This clip"} — ${valueTitlePhrase(
        participants.field,
      )}`;
      const lines: ConflictLine[] = [];
      if (oursClip) {
        lines.push(
          line(
            "main",
            "main",
            ours,
            oursClip,
            valueFor(participants.field, oursClip, baseClip, "main", rate),
          ),
        );
      }
      if (theirsClip) {
        lines.push(
          line(
            "cut",
            cutName,
            theirs,
            theirsClip,
            valueFor(participants.field, theirsClip, baseClip, "cut", rate),
          ),
        );
      }
      if (baseClip) {
        lines.push(
          line(
            "original",
            "Original",
            base,
            baseClip,
            valueFor(participants.field, baseClip, baseClip, "original", rate),
          ),
        );
      }
      cards.push({
        conflictId: conflict.conflictId,
        bucket: 1,
        title,
        lines,
        // #139 — cut names verbatim, even for agent cuts.
        buttons: [
          { label: "Keep main's", choice: "ours" },
          { label: `Keep ${cutName}'s`, choice: "theirs" },
          { label: "Keep original", choice: "base" },
        ],
        chosen,
      });
      continue;
    }

    if (participants.kind === "delete") {
      const ids = familyIds(participants.rootId, [base, ours, theirs]);
      for (const id of participants.clipIds) ids.add(id);
      const present = (map: Map<string, Located>): AnyClip | undefined => {
        for (const id of ids) {
          const found = map.get(id);
          if (found) return found.clip;
        }
        return undefined;
      };
      const oursClip = present(sides.ours);
      const theirsClip = present(sides.theirs);
      const baseClip = present(sides.base);
      // The engine does not say which side removed. The question is about
      // the PARTICIPANT — the piece or span the conflict is actually about —
      // not the family: with a split family both sides can hold some piece
      // while the participant exists on one side only, and a family-wide
      // scan then names the wrong remover, inverts the title and swaps the
      // buttons (Codex BUG 2).
      const holds = (map: Map<string, Located>): boolean =>
        participants.clipIds.some((id) => map.has(id));
      const holdsOurs = holds(sides.ours);
      const holdsTheirs = holds(sides.theirs);
      const cutRemoved =
        holdsOurs !== holdsTheirs
          ? // Exactly one side has the participant: the other removed it.
            holdsOurs
          : // Ambiguous (both hold a participant id, or neither does) — fall
            // back to the family scan, and if that is ambiguous too assume
            // main, so a card still renders rather than the preview failing.
            oursClip !== undefined && theirsClip === undefined;
      const mainRemoved = !cutRemoved;
      const keeperClip = mainRemoved ? theirsClip : oursClip;
      const keeperRows = rowsAgainstBase(mainRemoved ? "theirs" : "ours");
      const keeperRow = keeperRows.find((row) =>
        row.clipIds.some((id) => ids.has(id)),
      );
      const named = baseClip ?? keeperClip;
      const namedIn = baseClip ? base : mainRemoved ? theirs : ours;
      const clipName = named ? nameOf(namedIn, named) : "This clip";
      const remover = mainRemoved ? "main" : cutName;
      const keeper = mainRemoved ? cutName : "main";
      // #140 / #140a — whichever side removed comes first.
      const title = `${clipName} — ${remover} removed it, ${keeper} ${keeperPhrase(keeperRow)}`;

      // #141 — the remover's line has no clip of its own; it borrows the
      // Original's thumbnail so the row still shows what was removed.
      const removerLine: ConflictLine = {
        side: mainRemoved ? "main" : "cut",
        label: remover,
        clipId: null,
        clipName,
        thumbnail: baseClip ? thumbOf(base, baseClip) : null,
        value: "Removed",
        laneIds: { before: [], after: [] },
        jump: null,
      };
      const keeperLine = line(
        mainRemoved ? "cut" : "main",
        keeper,
        mainRemoved ? theirs : ours,
        keeperClip,
        keeperValue(keeperRow, keeperClip, rate),
      );
      cards.push({
        conflictId: conflict.conflictId,
        bucket: 2,
        title,
        // No Original line in this bucket (F3(2) lock).
        lines: mainRemoved
          ? [removerLine, keeperLine]
          : [keeperLine, removerLine],
        // #142 — the engine's `base` choice is not offered here.
        buttons: [
          {
            label: "Keep main's",
            choice: mainRemoved ? "delete" : "clip",
          },
          {
            label: `Keep ${cutName}'s`,
            choice: mainRemoved ? "clip" : "delete",
          },
        ],
        chosen,
      });
      continue;
    }

    // Bucket 3 — two clips landed on the same spot of one track.
    const [idA, idB] = participants.clipIds;
    // The engine's OWN draft of this collision (`MergeSuccess.composed`):
    // both clips are in it, at the positions that made them collide. Neither
    // source side shows that — main's copy sits where main put it, the cut's
    // where the cut put it, and when BOTH sides moved the same clip there is
    // no way to tell from the sides alone which move survived the answers
    // upstream (Codex BUG 1: the range could read start-after-end).
    const composed = index(record.composed);
    const placed = (clip: AnyClip) =>
      `${startOf(clip)}:${clip.timelineRange.duration.value}`;
    /**
     * #144's `from ‹side›`. A clip only one side has belongs to that side.
     * When both sides hold it, the composed position decides: main first
     * (a clip that never moved is main's), then the cut. If neither matches
     * — the merge composed something out of both — the card says `main`
     * rather than inventing a third answer.
     */
    const owner = (id: string): "main" | "cut" => {
      const inOurs = sides.ours.get(id);
      const inTheirs = sides.theirs.get(id);
      if (!inOurs) return "cut";
      if (!inTheirs) return "main";
      const here = composed.get(id);
      if (!here) return "main";
      if (placed(inOurs.clip) === placed(here.clip)) return "main";
      if (placed(inTheirs.clip) === placed(here.clip)) return "cut";
      return "main";
    };
    /** The clip the card NAMES — from the side it came from (names are the
     * sides' own; the composed draft rebuilds clips and loses them). */
    const locate = (
      id: string,
    ): { clip: AnyClip; timeline: Timeline } | undefined => {
      const from = owner(id);
      const found = (from === "cut" ? sides.theirs : sides.ours).get(id);
      if (found) {
        return { clip: found.clip, timeline: from === "cut" ? theirs : ours };
      }
      const inAfter = sides.after.get(id);
      if (inAfter) return { clip: inAfter.clip, timeline: after };
      const inBase = sides.base.get(id);
      return inBase ? { clip: inBase.clip, timeline: base } : undefined;
    };
    /** The clip the card MEASURES — the composed one, where the two collide. */
    const positioned = (id: string): AnyClip | undefined =>
      composed.get(id)?.clip ?? locate(id)?.clip;
    const a = locate(idA);
    const b = locate(idB);
    const nameA = a ? nameOf(a.timeline, a.clip) : "This clip";
    const nameB = b ? nameOf(b.timeline, b.clip) : "This clip";
    const trackOf = (trackId: string): string | undefined => {
      for (const timeline of [after, ours, theirs, base]) {
        const track = timeline.tracks.find((t) => t.id === trackId);
        if (track) return trackDisplayName(track, timeline);
      }
      return undefined;
    };
    const trackName = trackOf(participants.trackId) ?? participants.trackId;
    // The overlap itself: the intersection of the two composed ranges. The
    // engine found this pair BY that intersection, so it is always positive
    // here; the clamp is a floor, not a case (a range can never print
    // backwards).
    const pa = positioned(idA);
    const pb = positioned(idB);
    const overlapStart =
      pa && pb ? Math.max(startOf(pa), startOf(pb)) : (pa ?? pb)
        ? startOf((pa ?? pb)!)
        : 0;
    const overlapEnd = Math.max(
      overlapStart,
      pa && pb ? Math.min(endOf(pa), endOf(pb)) : (pa ?? pb)
        ? endOf((pa ?? pb)!)
        : 0,
    );
    const title = `${quoted(nameA)} and ${quoted(nameB)} overlap on ${trackName} (${formatFrames(
      overlapStart,
      rate,
    )}–${formatFrames(overlapEnd, rate)})`;

    // #144 — the LABEL is the clip's own name here; the value says which
    // cut it came from. A clip only the cut has is the cut's; anything main
    // holds is main's.
    const fromLine = (id: string, name: string): ConflictLine => {
      const isCut = owner(id) === "cut";
      const found = locate(id);
      return line(
        isCut ? "cut" : "main",
        name,
        found?.timeline ?? ours,
        found?.clip,
        isCut ? `from ${cutName}` : "from main",
        { label: name },
      );
    };

    // Was anything sitting in that spot originally? (#144's note.)
    let baseCover: AnyClip | undefined;
    const baseTrack = base.tracks.find((t) => t.id === participants.trackId);
    if (baseTrack) {
      baseCover = (baseTrack.clips as AnyClip[]).find(
        (clip) => startOf(clip) < overlapEnd && endOf(clip) > overlapStart,
      );
    }
    const originalLine: ConflictLine = {
      side: "original",
      label: "Original",
      clipId: null,
      clipName: baseCover ? nameOf(base, baseCover) : "",
      thumbnail: baseCover ? thumbOf(base, baseCover) : null,
      value: baseCover
        ? `${quoted(nameOf(base, baseCover))} was here`
        : "(this spot was empty)",
      laneIds: { before: [], after: [] },
      jump: null,
    };

    cards.push({
      conflictId: conflict.conflictId,
      bucket: 3,
      title,
      lines: [fromLine(idA, nameA), fromLine(idB, nameB), originalLine],
      // #145 — the third is the engine's `base` choice, renamed.
      buttons: [
        { label: `Move ${quoted(nameA)} later`, choice: "shift-a" },
        { label: `Move ${quoted(nameB)} later`, choice: "shift-b" },
        { label: "Keep original", choice: "base" },
      ],
      chosen,
    });
  }

  return cards;
}
