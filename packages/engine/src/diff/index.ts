import type { Timeline } from "../types";
import type { DiffResult, KeyedEntry, Located } from "./types";
import {
  KHAANA_ORDER,
  clipKey,
  cmpKey,
  indexClips,
  nearestAncestorIn,
  tlStart,
} from "./match";
import { classifyFamily, classifyPair } from "./classify";

export type {
  AddedEntry,
  DiffEntry,
  DiffPropertyName,
  DiffResult,
  MovedEntry,
  PropertyChangedEntry,
  RawChangedEntry,
  RemovedEntry,
  SlippedEntry,
  SplitEntry,
  TrimmedEntry,
} from "./types";

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Public API #2 of 7 — computeDiff
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

/**
 * Compute the deterministic semantic diff of two timelines: what changed
 * going from `a` (before) to `b` (after). Returns the khaana-level
 * machine entries.
 * diff(A, A) is empty (PRD invariant).
 */
export function computeDiff(a: Timeline, b: Timeline): DiffResult {
  const keyed: KeyedEntry[] = [];

  // Timeline-level #16 (out-of-family: engine is single-rate, ).
  if (a.projectRate !== b.projectRate) {
    keyed.push({
      key: [Number.NEGATIVE_INFINITY, 0, 0, "", 0, "", KHAANA_ORDER[16]],
      entry: {
        rule: 16,
        kind: "rawChanged",
        scope: "timeline",
        trackId: null,
        clipId: null,
        field: "projectRate",
        before: String(a.projectRate),
        after: String(b.projectRate),
      },
    });
  }

  // Track order: a's tracks first, then b-only tracks. Track add/delete is
  // out of scope, so a differing track set is reported as a fallback diff.
  const trackIndexById = new Map<string, number>();
  for (const t of a.tracks) trackIndexById.set(t.id, trackIndexById.size);
  for (const t of b.tracks) {
    if (!trackIndexById.has(t.id))
      trackIndexById.set(t.id, trackIndexById.size);
  }
  const aTracks = new Map(a.tracks.map((t) => [t.id, t]));
  const bTracks = new Map(b.tracks.map((t) => [t.id, t]));
  const trackRaw = (
    trackId: string,
    field: string,
    before: string,
    after: string,
  ): void => {
    keyed.push({
      key: [
        trackIndexById.get(trackId) ?? 0,
        Number.NEGATIVE_INFINITY,
        0,
        "",
        0,
        "",
        KHAANA_ORDER[16],
      ],
      entry: {
        rule: 16,
        kind: "rawChanged",
        scope: "track",
        trackId,
        clipId: null,
        field,
        before,
        after,
      },
    });
  };
  for (const [id] of trackIndexById) {
    const at = aTracks.get(id);
    const bt = bTracks.get(id);
    if (at && !bt) trackRaw(id, "existence", "present", "absent");
    else if (!at && bt) trackRaw(id, "existence", "absent", "present");
    else if (at && bt && at.kind !== bt.kind) {
      trackRaw(id, "kind", at.kind, bt.kind);
    }
  }

  // MATCH — ID-only + khandaan grouping.
  const aClips = indexClips(a, trackIndexById);
  const bClips = indexClips(b, trackIndexById);

  const families = new Map<string, Located[]>();
  const added: Located[] = [];
  for (const [id, loc] of bClips) {
    if (aClips.has(id)) continue;
    const baseId = nearestAncestorIn(id, aClips);
    if (baseId === null) {
      added.push(loc);
      continue;
    }
    const fam = families.get(baseId);
    if (fam) fam.push(loc);
    else families.set(baseId, [loc]);
  }
  // The surviving base-id piece belongs to its family too.
  for (const [baseId, fam] of families) {
    const baseInB = bClips.get(baseId);
    if (baseInB) fam.push(baseInB);
  }

  // CLASSIFY — every a-clip, then genuinely added b-clips.
  for (const [id, aLoc] of aClips) {
    const fam = families.get(id);
    if (fam) {
      classifyFamily(aLoc, fam, bClips.get(id), keyed);
      continue;
    }
    const bLoc = bClips.get(id);
    if (!bLoc) {
      keyed.push({
        key: [...clipKey(aLoc), KHAANA_ORDER[14]],
        entry: {
          rule: 14,
          kind: "removed",
          trackId: aLoc.track.id,
          clipId: id,
          start: tlStart(aLoc.clip),
          duration: aLoc.clip.timelineRange.duration.value,
        },
      });
      continue;
    }
    classifyPair(aLoc, bLoc, "pair", keyed);
  }
  for (const loc of added) {
    keyed.push({
      key: [...clipKey(loc), KHAANA_ORDER[13]],
      entry: {
        rule: 13,
        kind: "added",
        trackId: loc.track.id,
        clipId: loc.clip.id,
        start: tlStart(loc.clip),
        duration: loc.clip.timelineRange.duration.value,
      },
    });
  }

  // ORDER.
  keyed.sort((x, y) => cmpKey(x.key, y.key));
  return { entries: keyed.map((k) => k.entry) };
}
