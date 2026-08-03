/**
 * M4 — pure three-way merge engine.
 *
 * The engine compares net state, refines split families by lineage span,
 * composes independent atoms, withholds unresolved participants, and replays
 * permanent choices from the original base/ours/theirs inputs on every call.
 */

import { checkInvariants } from "./invariants";
import type { InvariantViolation } from "./invariants";
import type {
  Clip,
  ClipProperties,
  Position,
  TextClip,
  TextClipProperties,
  TextStyle,
  Timeline,
  Track,
} from "./types";
import { PROPERTY_DEFAULTS } from "./verbs";

export type ValueChoice = "ours" | "theirs" | "base";
export type DeleteChoice = "delete" | "clip" | "base";
export type OverlapChoice = "shift-a" | "shift-b" | "base";
export type MergeChoice = ValueChoice | DeleteChoice | OverlapChoice;
export type MergeChoices = Readonly<Record<string, MergeChoice>>;

export type MergeField =
  | "timeline-offset"
  | "coverage-start"
  | "coverage-end"
  | "source-offset"
  | "volume"
  | "opacity"
  | "scale"
  | "position"
  | "text-content"
  | "text-style"
  | "source-bounds"
  | "negative-start"
  | "nonpositive-duration";

export type ValueParticipants = {
  kind: "value";
  trackId: string;
  rootId: string;
  clipIds: readonly string[];
  field: MergeField;
};

export type DeleteParticipants = {
  kind: "delete";
  trackId: string;
  rootId: string;
  clipIds: readonly string[];
};

export type OverlapParticipants = {
  kind: "overlap";
  trackId: string;
  clipIds: readonly [string, string];
};

export type MergeParticipants =
  ValueParticipants | DeleteParticipants | OverlapParticipants;

export type MergeConflict = {
  conflictId: string;
  bucket: 1 | 2 | 3;
  participants: MergeParticipants;
  explanation: string;
  choices: readonly MergeChoice[];
};

export type MergeCounts = {
  total: number;
  resolved: number;
  remaining: number;
};

export type MergeSuccess = {
  ok: true;
  status: "ready" | "needs-resolution";
  timeline: Timeline;
  conflicts: readonly MergeConflict[];
  choices: MergeChoices;
  counts: MergeCounts;
};

export type MergeFailure = {
  ok: false;
  error: { code: "E_MERGE_PRECONDITION"; message: string };
};

export type MergeResult = MergeSuccess | MergeFailure;
export type FinalizeResult = { ok: true; timeline: Timeline } | MergeFailure;

export type StartMergeInput = {
  base: Timeline;
  ours: Timeline;
  theirs: Timeline;
};

export type ApplyChoiceInput = StartMergeInput & {
  choices: MergeChoices;
  conflictId: string;
  choice: MergeChoice;
};

export type FinalizeCheckInput = StartMergeInput & {
  choices: MergeChoices;
};

/** Package-private, lossless T3 delta. It is deliberately not re-exported. */
export type MergeDelta = {
  baseFingerprint: string;
  projectRate?: number;
  tracks?: Track[];
  mediaRefs?: Timeline["mediaRefs"];
};

type AnyClip = Clip | TextClip;
type Side = "base" | "ours" | "theirs";
type Atom = { value: unknown; present: boolean };
type AtomMap = Record<MergeField, Atom | undefined>;

type LocatedClip = {
  clip: AnyClip;
  trackId: string;
  trackIndex: number;
  spanStart: number;
  spanEnd: number;
};

type Family = {
  rootId: string;
  trackId: string;
  trackIndex: number;
  pieces: LocatedClip[];
};

type Normalized = {
  kind: "media" | "text";
  trackId: string;
  rootId: string;
  sourceClipId: string;
  mediaRefId?: string;
  atoms: AtomMap;
};

type Segment = {
  start: number;
  end: number;
  normalized: Normalized;
};

type InternalConflict = {
  public: MergeConflict;
  trackIndex: number;
  timelineStart: number;
  rootId: string;
  clipId: string;
  fieldOrder: number;
};

type MergeContext = {
  base: Timeline;
  ours: Timeline;
  theirs: Timeline;
  choices: MergeChoices;
  conflicts: Map<string, InternalConflict>;
  invalidChoice: string | null;
};

const VALUE_CHOICES = ["ours", "theirs", "base"] as const;
const DELETE_CHOICES = ["delete", "clip", "base"] as const;
const OVERLAP_CHOICES = ["shift-a", "shift-b", "base"] as const;

const FIELD_ORDER: readonly MergeField[] = [
  "timeline-offset",
  "coverage-start",
  "coverage-end",
  "source-offset",
  "volume",
  "opacity",
  "scale",
  "position",
  "text-content",
  "text-style",
  "source-bounds",
  "negative-start",
  "nonpositive-duration",
];

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fingerprint = (value: unknown): string => JSON.stringify(value);

/** T3 private lossless delta constructor. */
export function makeDelta(base: Timeline, target: Timeline): MergeDelta {
  const delta: MergeDelta = { baseFingerprint: fingerprint(base) };
  if (base.projectRate !== target.projectRate)
    delta.projectRate = target.projectRate;
  if (fingerprint(base.tracks) !== fingerprint(target.tracks)) {
    delta.tracks = clone(target.tracks);
  }
  if (fingerprint(base.mediaRefs) !== fingerprint(target.mediaRefs)) {
    delta.mediaRefs = clone(target.mediaRefs);
  }
  return delta;
}

/** T3 private lossless delta application. */
export function applyDelta(base: Timeline, delta: MergeDelta): Timeline {
  if (fingerprint(base) !== delta.baseFingerprint) {
    throw new Error("MergeDelta base mismatch");
  }
  return {
    projectRate: delta.projectRate ?? base.projectRate,
    tracks: clone(delta.tracks ?? base.tracks),
    mediaRefs: clone(delta.mediaRefs ?? base.mediaRefs),
  };
}

const isText = (clip: AnyClip): clip is TextClip => "textContent" in clip;
const spanStart = (clip: AnyClip): number => clip.lineage.span.start.value;
const spanEnd = (clip: AnyClip): number =>
  spanStart(clip) + clip.lineage.span.duration.value;
const timelineStart = (clip: AnyClip): number => clip.timelineRange.start.value;
const timelineEnd = (clip: AnyClip): number =>
  timelineStart(clip) + clip.timelineRange.duration.value;
const anchor = (clip: AnyClip): number => timelineStart(clip) - spanStart(clip);
const sourceOffset = (clip: Clip): number =>
  clip.sourceRange.start.value - spanStart(clip);

const atom = (value: unknown, present = true): Atom => ({
  value: clone(value),
  present,
});

const equalValue = (a: unknown, b: unknown): boolean =>
  fingerprint(a) === fingerprint(b);

const equalAtom = (a: Atom | undefined, b: Atom | undefined): boolean =>
  a === undefined || b === undefined ? a === b : equalValue(a.value, b.value);

const propertyAtom = (value: unknown, present: boolean): Atom =>
  atom(value, present);

function normalize(loc: LocatedClip): Normalized {
  const clip = loc.clip;
  const atoms: AtomMap = {
    "timeline-offset": atom(anchor(clip)),
    "coverage-start": undefined,
    "coverage-end": undefined,
    "source-offset": undefined,
    volume: undefined,
    opacity: undefined,
    scale: undefined,
    position: undefined,
    "text-content": undefined,
    "text-style": undefined,
    "source-bounds": undefined,
    "negative-start": undefined,
    "nonpositive-duration": undefined,
  };

  if (isText(clip)) {
    atoms.opacity = propertyAtom(
      clip.properties?.opacity ?? PROPERTY_DEFAULTS.opacity,
      clip.properties?.opacity !== undefined,
    );
    atoms.position = propertyAtom(
      clip.properties?.position ?? PROPERTY_DEFAULTS.position,
      clip.properties?.position !== undefined,
    );
    atoms["text-content"] = atom(clip.textContent);
    atoms["text-style"] = atom(clip.textStyle);
    return {
      kind: "text",
      trackId: loc.trackId,
      rootId: clip.lineage.rootId,
      sourceClipId: clip.id,
      atoms,
    };
  }

  atoms["source-offset"] = atom(sourceOffset(clip));
  atoms.volume = propertyAtom(
    clip.properties.volume ?? PROPERTY_DEFAULTS.volume,
    clip.properties.volume !== undefined,
  );
  atoms.opacity = propertyAtom(
    clip.properties.opacity ?? PROPERTY_DEFAULTS.opacity,
    clip.properties.opacity !== undefined,
  );
  atoms.scale = propertyAtom(
    clip.properties.scale ?? PROPERTY_DEFAULTS.scale,
    clip.properties.scale !== undefined,
  );
  atoms.position = propertyAtom(
    clip.properties.position ?? PROPERTY_DEFAULTS.position,
    clip.properties.position !== undefined,
  );
  return {
    kind: "media",
    trackId: loc.trackId,
    rootId: clip.lineage.rootId,
    sourceClipId: clip.id,
    mediaRefId: clip.mediaRefId,
    atoms,
  };
}

function indexFamilies(timeline: Timeline): Map<string, Family> {
  const out = new Map<string, Family>();
  timeline.tracks.forEach((track, trackIndex) => {
    const clips: readonly AnyClip[] = track.clips;
    for (const clip of clips) {
      const rootId = clip.lineage.rootId;
      const loc: LocatedClip = {
        clip,
        trackId: track.id,
        trackIndex,
        spanStart: spanStart(clip),
        spanEnd: spanEnd(clip),
      };
      const family = out.get(rootId);
      if (family) family.pieces.push(loc);
      else {
        out.set(rootId, {
          rootId,
          trackId: track.id,
          trackIndex,
          pieces: [loc],
        });
      }
    }
  });
  for (const family of out.values()) {
    family.pieces.sort(
      (a, b) =>
        a.spanStart - b.spanStart ||
        a.spanEnd - b.spanEnd ||
        a.clip.id.localeCompare(b.clip.id),
    );
  }
  return out;
}

function familyKey(family: Family): string {
  return fingerprint(
    family.pieces.map((piece) => {
      const n = normalize(piece);
      return {
        id: piece.clip.id,
        start: piece.spanStart,
        end: piece.spanEnd,
        kind: n.kind,
        mediaRefId: n.mediaRefId ?? null,
        atoms: Object.fromEntries(
          FIELD_ORDER.map((field) => [field, n.atoms[field]?.value ?? null]),
        ),
      };
    }),
  );
}

function familyBounds(family: Family): [number, number] {
  return [
    Math.min(...family.pieces.map((p) => p.spanStart)),
    Math.max(...family.pieces.map((p) => p.spanEnd)),
  ];
}

function findCover(
  family: Family | undefined,
  start: number,
  end: number,
): LocatedClip | undefined {
  return family?.pieces.find(
    (piece) => piece.spanStart <= start && piece.spanEnd >= end,
  );
}

function edgeReference(family: Family, point: number): LocatedClip {
  const cover = family.pieces.find(
    (piece) => piece.spanStart <= point && piece.spanEnd >= point,
  );
  if (cover) return cover;
  if (point < family.pieces[0].spanStart) return family.pieces[0];
  return family.pieces[family.pieces.length - 1];
}

function projectedOuterCover(
  family: Family,
  start: number,
  end: number,
): LocatedClip | undefined {
  const actual = findCover(family, start, end);
  if (actual) return actual;
  const [outerStart, outerEnd] = familyBounds(family);
  return end <= outerStart || start >= outerEnd
    ? edgeReference(family, start)
    : undefined;
}

function splitCuts(family: Family | undefined): number[] {
  if (!family) return [];
  const cuts: number[] = [];
  for (let i = 1; i < family.pieces.length; i++) {
    if (family.pieces[i - 1].spanEnd === family.pieces[i].spanStart) {
      cuts.push(family.pieces[i].spanStart);
    }
  }
  return cuts;
}

function lineageIdCuts(family: Family | undefined): number[] {
  if (!family) return [];
  const cuts: number[] = [];
  for (const piece of family.pieces) {
    const suffix = piece.clip.id.slice(piece.clip.lineage.rootId.length);
    for (const token of suffix.split("@")) {
      if (token.length === 0) continue;
      const value = Number(token);
      if (Number.isSafeInteger(value)) cuts.push(value);
    }
  }
  return cuts;
}

const uniqueSorted = (values: number[]): number[] =>
  [...new Set(values)].sort((a, b) => a - b);

function stableClipIds(...clips: Array<LocatedClip | undefined>): string[] {
  return [...new Set(clips.filter(Boolean).map((loc) => loc!.clip.id))].sort();
}

function encodedConflictId(payload: readonly unknown[]): string {
  return `m4:${encodeURIComponent(JSON.stringify(payload))}`;
}

function conflictChoice(
  ctx: MergeContext,
  internal: InternalConflict,
): MergeChoice | undefined {
  const saved = ctx.choices[internal.public.conflictId];
  if (saved === undefined) {
    ctx.conflicts.set(internal.public.conflictId, internal);
    return undefined;
  }
  if (!internal.public.choices.includes(saved)) {
    ctx.invalidChoice = `choice ${saved} is invalid for conflict ${internal.public.conflictId}`;
    return undefined;
  }
  return saved;
}

function valueConflict(
  ctx: MergeContext,
  input: {
    trackId: string;
    trackIndex: number;
    rootId: string;
    clipIds: string[];
    field: MergeField;
    timelineStart: number;
  },
): ValueChoice | undefined {
  const conflictId = encodedConflictId([
    "value",
    input.trackId,
    input.rootId,
    input.clipIds,
    input.field,
  ]);
  return conflictChoice(ctx, {
    public: {
      conflictId,
      bucket: 1,
      participants: {
        kind: "value",
        trackId: input.trackId,
        rootId: input.rootId,
        clipIds: input.clipIds,
        field: input.field,
      },
      explanation: `Clip ${input.clipIds.join("/")} changed ${input.field} differently`,
      choices: VALUE_CHOICES,
    },
    trackIndex: input.trackIndex,
    timelineStart: input.timelineStart,
    rootId: input.rootId,
    clipId: input.clipIds[0] ?? input.rootId,
    fieldOrder: FIELD_ORDER.indexOf(input.field),
  }) as ValueChoice | undefined;
}

function deleteConflict(
  ctx: MergeContext,
  input: {
    trackId: string;
    trackIndex: number;
    rootId: string;
    clipIds: string[];
    timelineStart: number;
  },
): DeleteChoice | undefined {
  const conflictId = encodedConflictId([
    "delete",
    input.trackId,
    input.rootId,
    input.clipIds,
  ]);
  return conflictChoice(ctx, {
    public: {
      conflictId,
      bucket: 2,
      participants: {
        kind: "delete",
        trackId: input.trackId,
        rootId: input.rootId,
        clipIds: input.clipIds,
      },
      explanation: `Clip family ${input.rootId} was deleted on one side and changed on the other`,
      choices: DELETE_CHOICES,
    },
    trackIndex: input.trackIndex,
    timelineStart: input.timelineStart,
    rootId: input.rootId,
    clipId: input.clipIds[0] ?? input.rootId,
    fieldOrder: FIELD_ORDER.length,
  }) as DeleteChoice | undefined;
}

function canonicalChangedAtom(
  field: MergeField,
  ours: Atom,
  theirs: Atom,
): Atom {
  const value = ours.value;
  const defaultValue =
    field === "volume" || field === "opacity"
      ? 100
      : field === "scale"
        ? 1
        : field === "position"
          ? PROPERTY_DEFAULTS.position
          : undefined;
  if (defaultValue !== undefined && equalValue(value, defaultValue)) {
    return atom(value, false);
  }
  return atom(value, ours.present && theirs.present);
}

function mergeAtom(
  ctx: MergeContext,
  input: {
    field: MergeField;
    base: Atom | undefined;
    ours: Atom | undefined;
    theirs: Atom | undefined;
    trackId: string;
    trackIndex: number;
    rootId: string;
    clipIds: string[];
    timelineStart: number;
  },
): Atom | undefined | null {
  const { base, ours, theirs } = input;
  if (ours === undefined || theirs === undefined) return ours ?? theirs ?? base;
  if (base === undefined) {
    if (equalAtom(ours, theirs))
      return canonicalChangedAtom(input.field, ours, theirs);
    const choice = valueConflict(ctx, input);
    if (choice === undefined) return null;
    return choice === "ours" ? ours : choice === "theirs" ? theirs : undefined;
  }
  const oursChanged = !equalAtom(ours, base);
  const theirsChanged = !equalAtom(theirs, base);
  if (!oursChanged && !theirsChanged) return base;
  if (oursChanged && !theirsChanged) return ours;
  if (!oursChanged && theirsChanged) return theirs;
  if (equalAtom(ours, theirs))
    return canonicalChangedAtom(input.field, ours, theirs);
  const choice = valueConflict(ctx, input);
  if (choice === undefined) return null;
  return choice === "ours" ? ours : choice === "theirs" ? theirs : base;
}

function mergeNumber(
  ctx: MergeContext,
  input: Omit<Parameters<typeof mergeAtom>[1], "base" | "ours" | "theirs"> & {
    base: number;
    ours: number;
    theirs: number;
  },
): number | null {
  const merged = mergeAtom(ctx, {
    ...input,
    base: atom(input.base),
    ours: atom(input.ours),
    theirs: atom(input.theirs),
  });
  return merged === null || merged === undefined
    ? null
    : (merged.value as number);
}

function normalizedEqual(a: Normalized, b: Normalized): boolean {
  if (
    a.kind !== b.kind ||
    a.trackId !== b.trackId ||
    a.mediaRefId !== b.mediaRefId
  ) {
    return false;
  }
  return FIELD_ORDER.every((field) =>
    equalAtom(a.atoms[field], b.atoms[field]),
  );
}

function mergeNormalized(
  ctx: MergeContext,
  input: {
    base: Normalized;
    ours: Normalized;
    theirs: Normalized;
    trackIndex: number;
    clipIds: string[];
    timelineStart: number;
  },
): Normalized | null {
  const atoms = {} as AtomMap;
  for (const field of FIELD_ORDER) {
    if (
      field === "coverage-start" ||
      field === "coverage-end" ||
      field === "source-bounds" ||
      field === "negative-start" ||
      field === "nonpositive-duration"
    ) {
      atoms[field] = undefined;
      continue;
    }
    const merged = mergeAtom(ctx, {
      field,
      base: input.base.atoms[field],
      ours: input.ours.atoms[field],
      theirs: input.theirs.atoms[field],
      trackId: input.base.trackId,
      trackIndex: input.trackIndex,
      rootId: input.base.rootId,
      clipIds: input.clipIds,
      timelineStart: input.timelineStart,
    });
    if (merged === null) return null;
    atoms[field] = merged;
  }
  return {
    kind: input.base.kind,
    trackId: input.base.trackId,
    rootId: input.base.rootId,
    sourceClipId: input.base.sourceClipId,
    mediaRefId: input.base.mediaRefId,
    atoms,
  };
}

function projectNormalized(loc: LocatedClip): Normalized {
  return normalize(loc);
}

function toClip(
  normalized: Normalized,
  id: string,
  start: number,
  end: number,
  rate: number,
): AnyClip {
  const duration = end - start;
  const timelineOffset = normalized.atoms["timeline-offset"]!.value as number;
  const timelineRange = {
    start: { value: timelineOffset + start, rate },
    duration: { value: duration, rate },
  };
  const lineage = {
    rootId: normalized.rootId,
    span: {
      start: { value: start, rate },
      duration: { value: duration, rate },
    },
  };

  const opacity = normalized.atoms.opacity;
  const position = normalized.atoms.position;
  if (normalized.kind === "text") {
    const properties: TextClipProperties = {};
    if (opacity?.present) properties.opacity = opacity.value as number;
    if (position?.present)
      properties.position = clone(position.value as Position);
    const clip: TextClip = {
      id,
      timelineRange,
      textContent: normalized.atoms["text-content"]!.value as string,
      textStyle: clone(normalized.atoms["text-style"]!.value as TextStyle),
      lineage,
    };
    if (Object.keys(properties).length > 0) clip.properties = properties;
    return clip;
  }

  const properties: ClipProperties = {};
  const volume = normalized.atoms.volume;
  const scale = normalized.atoms.scale;
  if (volume?.present) properties.volume = volume.value as number;
  if (opacity?.present) properties.opacity = opacity.value as number;
  if (scale?.present) properties.scale = scale.value as number;
  if (position?.present)
    properties.position = clone(position.value as Position);
  const srcOffset = normalized.atoms["source-offset"]!.value as number;
  return {
    id,
    mediaRefId: normalized.mediaRefId!,
    sourceRange: {
      start: { value: srcOffset + start, rate },
      duration: { value: duration, rate },
    },
    timelineRange,
    properties,
    lineage,
  };
}

function canonicalPieceId(
  rootId: string,
  start: number,
  baseFamily: Family | undefined,
  unionCuts: number[],
): string {
  if (!baseFamily) return rootId;
  const exactBase = baseFamily.pieces.find((p) => p.spanStart === start);
  if (exactBase) return exactBase.clip.id;
  const basePiece =
    baseFamily.pieces.find((p) => p.spanStart < start && p.spanEnd > start) ??
    (start <= baseFamily.pieces[0].spanStart
      ? baseFamily.pieces[0]
      : baseFamily.pieces[baseFamily.pieces.length - 1]);
  let id = basePiece.clip.id;
  for (const cut of unionCuts) {
    if (cut > basePiece.spanStart && cut <= start && !id.endsWith(`@${cut}`)) {
      id = `${id}@${cut}`;
    }
  }
  return id;
}

function mergeSegments(segments: Segment[], cuts: Set<number>): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (
      previous &&
      previous.end === segment.start &&
      !cuts.has(segment.start) &&
      normalizedEqual(previous.normalized, segment.normalized)
    ) {
      previous.end = segment.end;
    } else {
      out.push({ ...segment });
    }
  }
  return out;
}

function cloneFamily(family: Family | undefined): AnyClip[] {
  return family ? family.pieces.map((piece) => clone(piece.clip)) : [];
}

function allFamilyClipIds(...families: Array<Family | undefined>): string[] {
  return [
    ...new Set(
      families.flatMap((family) =>
        family ? family.pieces.map((piece) => piece.clip.id) : [],
      ),
    ),
  ].sort();
}

function chooseFamily(
  choice: ValueChoice | DeleteChoice,
  base: Family | undefined,
  ours: Family | undefined,
  theirs: Family | undefined,
  changedSide?: Side,
): AnyClip[] {
  if (choice === "base") return cloneFamily(base);
  if (choice === "delete") return [];
  if (choice === "clip") {
    return cloneFamily(changedSide === "ours" ? ours : theirs);
  }
  return cloneFamily(choice === "ours" ? ours : theirs);
}

function familyJointViolation(
  timeline: Timeline,
  trackId: string,
  clips: AnyClip[],
): InvariantViolation | undefined {
  const track = timeline.tracks.find((item) => item.id === trackId);
  if (!track) return undefined;
  const candidate: Timeline = {
    projectRate: timeline.projectRate,
    mediaRefs: timeline.mediaRefs,
    tracks: [{ ...track, clips: clips as Track["clips"] }],
  };
  const priority: InvariantViolation["kind"][] = [
    "nonpositive-duration",
    "negative-start",
    "source-out-of-file",
    "source-timeline-duration-mismatch",
    "empty-text-content",
  ];
  return checkInvariants(candidate)
    .filter((violation) => violation.kind !== "overlap")
    .sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind))[0];
}

function violationField(violation: InvariantViolation): MergeField | null {
  switch (violation.kind) {
    case "nonpositive-duration":
      return "nonpositive-duration";
    case "negative-start":
      return "negative-start";
    case "source-out-of-file":
      return "source-bounds";
    case "source-timeline-duration-mismatch":
    case "empty-text-content":
    case "overlap":
      return null;
  }
}

function mergeFamily(
  ctx: MergeContext,
  baseFamily: Family | undefined,
  oursFamily: Family | undefined,
  theirsFamily: Family | undefined,
): AnyClip[] {
  const reference = baseFamily ?? oursFamily ?? theirsFamily;
  if (!reference) return [];
  const { rootId, trackId, trackIndex } = reference;
  const conflictsBefore = ctx.conflicts.size;
  const allIds = allFamilyClipIds(baseFamily, oursFamily, theirsFamily);
  const startHint = Math.min(
    ...reference.pieces.map((piece) => timelineStart(piece.clip)),
  );

  if (!baseFamily) {
    if (oursFamily && !theirsFamily) return cloneFamily(oursFamily);
    if (!oursFamily && theirsFamily) return cloneFamily(theirsFamily);
    if (oursFamily && theirsFamily) {
      return familyKey(oursFamily) === familyKey(theirsFamily)
        ? cloneFamily(oursFamily)
        : cloneFamily(
            familyKey(oursFamily) < familyKey(theirsFamily)
              ? oursFamily
              : theirsFamily,
          );
    }
    return [];
  }

  if (!oursFamily && !theirsFamily) return [];
  if (!oursFamily || !theirsFamily) {
    const present = oursFamily ?? theirsFamily!;
    const changedSide: Side = oursFamily ? "ours" : "theirs";
    if (familyKey(present) === familyKey(baseFamily)) return [];
    const choice = deleteConflict(ctx, {
      trackId,
      trackIndex,
      rootId,
      clipIds: allIds,
      timelineStart: startHint,
    });
    if (choice === undefined) return [];
    return chooseFamily(
      choice,
      baseFamily,
      oursFamily,
      theirsFamily,
      changedSide,
    );
  }

  // B1.2: a trim that erases a region edited on the other branch is B2.
  // This must run before outer coverage composition would hide that region.
  const eraseBoundaries = uniqueSorted([
    ...baseFamily.pieces.flatMap((piece) => [piece.spanStart, piece.spanEnd]),
    ...oursFamily.pieces.flatMap((piece) => [piece.spanStart, piece.spanEnd]),
    ...theirsFamily.pieces.flatMap((piece) => [piece.spanStart, piece.spanEnd]),
  ]);
  for (let index = 0; index < eraseBoundaries.length - 1; index++) {
    const start = eraseBoundaries[index];
    const end = eraseBoundaries[index + 1];
    const baseLoc = findCover(baseFamily, start, end);
    if (!baseLoc) continue;
    const oursLoc = findCover(oursFamily, start, end);
    const theirsLoc = findCover(theirsFamily, start, end);
    if ((oursLoc === undefined) === (theirsLoc === undefined)) continue;
    const changedFamily = oursLoc ? oursFamily : theirsFamily;
    if (changedFamily.pieces.length < 2) continue;
    const presentLoc = oursLoc ?? theirsLoc!;
    if (normalizedEqual(normalize(presentLoc), normalize(baseLoc))) continue;
    const choice = deleteConflict(ctx, {
      trackId,
      trackIndex,
      rootId,
      clipIds: stableClipIds(baseLoc, oursLoc, theirsLoc),
      timelineStart: timelineStart(baseLoc.clip),
    });
    if (choice === undefined) return [];
    if (choice === "base") return cloneFamily(baseFamily);
    if (choice === "clip") {
      return cloneFamily(oursLoc ? oursFamily : theirsFamily);
    }
    return cloneFamily(oursLoc ? theirsFamily : oursFamily);
  }

  const [baseStart, baseEnd] = familyBounds(baseFamily);
  const [oursStart, oursEnd] = familyBounds(oursFamily);
  const [theirsStart, theirsEnd] = familyBounds(theirsFamily);
  const edgeIds = stableClipIds(
    baseFamily.pieces[0],
    oursFamily.pieces[0],
    theirsFamily.pieces[0],
    baseFamily.pieces[baseFamily.pieces.length - 1],
    oursFamily.pieces[oursFamily.pieces.length - 1],
    theirsFamily.pieces[theirsFamily.pieces.length - 1],
  );
  const mergedStart = mergeNumber(ctx, {
    field: "coverage-start",
    base: baseStart,
    ours: oursStart,
    theirs: theirsStart,
    trackId,
    trackIndex,
    rootId,
    clipIds: edgeIds,
    timelineStart: startHint,
  });
  const mergedEnd = mergeNumber(ctx, {
    field: "coverage-end",
    base: baseEnd,
    ours: oursEnd,
    theirs: theirsEnd,
    trackId,
    trackIndex,
    rootId,
    clipIds: edgeIds,
    timelineStart: startHint,
  });
  if (mergedStart === null || mergedEnd === null) return [];

  if (mergedStart >= mergedEnd) {
    const choice = valueConflict(ctx, {
      trackId,
      trackIndex,
      rootId,
      clipIds: allIds,
      field: "nonpositive-duration",
      timelineStart: startHint,
    });
    if (choice === undefined) return [];
    return chooseFamily(choice, baseFamily, oursFamily, theirsFamily);
  }

  const unionCuts = uniqueSorted([
    ...splitCuts(baseFamily),
    ...splitCuts(oursFamily),
    ...splitCuts(theirsFamily),
    ...lineageIdCuts(baseFamily),
    ...lineageIdCuts(oursFamily),
    ...lineageIdCuts(theirsFamily),
  ]).filter((cut) => cut > mergedStart && cut < mergedEnd);
  const cutSet = new Set(unionCuts);
  const boundaries = uniqueSorted([
    mergedStart,
    mergedEnd,
    ...unionCuts,
    ...baseFamily.pieces.flatMap((p) => [p.spanStart, p.spanEnd]),
    ...oursFamily.pieces.flatMap((p) => [p.spanStart, p.spanEnd]),
    ...theirsFamily.pieces.flatMap((p) => [p.spanStart, p.spanEnd]),
  ]).filter((point) => point >= mergedStart && point <= mergedEnd);

  const segments: Segment[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) continue;

    const baseLoc = findCover(baseFamily, start, end);
    const oursActual = findCover(oursFamily, start, end);
    const theirsActual = findCover(theirsFamily, start, end);
    const oursLoc = projectedOuterCover(oursFamily, start, end);
    const theirsLoc = projectedOuterCover(theirsFamily, start, end);
    const baseReference = baseLoc ?? edgeReference(baseFamily, start);
    const baseNorm = projectNormalized(baseReference);
    const oursNorm = oursLoc ? projectNormalized(oursLoc) : undefined;
    const theirsNorm = theirsLoc ? projectNormalized(theirsLoc) : undefined;
    const clipIds = stableClipIds(
      baseLoc,
      oursActual,
      theirsActual,
      oursLoc,
      theirsLoc,
    );
    const logicalClipIds = [
      canonicalPieceId(rootId, start, baseFamily, unionCuts),
    ];
    const tlHint = Math.min(
      ...[baseLoc, oursLoc, theirsLoc]
        .filter(Boolean)
        .map((loc) => timelineStart(loc!.clip)),
    );

    let merged: Normalized | null | undefined;
    if (baseLoc) {
      if (!oursNorm && !theirsNorm) continue;
      if (!oursNorm || !theirsNorm) {
        const present = oursNorm ?? theirsNorm!;
        if (normalizedEqual(present, baseNorm)) continue;
        const choice = deleteConflict(ctx, {
          trackId,
          trackIndex,
          rootId,
          clipIds,
          timelineStart: tlHint,
        });
        if (choice === undefined || choice === "delete") continue;
        merged = choice === "base" ? baseNorm : present;
      } else {
        merged = mergeNormalized(ctx, {
          base: baseNorm,
          ours: oursNorm,
          theirs: theirsNorm,
          trackIndex,
          clipIds: logicalClipIds,
          timelineStart: tlHint,
        });
      }
    } else if (oursNorm && theirsNorm) {
      merged = mergeNormalized(ctx, {
        base: baseNorm,
        ours: oursNorm,
        theirs: theirsNorm,
        trackIndex,
        clipIds: logicalClipIds,
        timelineStart: tlHint,
      });
    } else {
      merged = oursNorm ?? theirsNorm;
    }
    if (merged) segments.push({ start, end, normalized: merged });
  }

  const coalesced = mergeSegments(segments, cutSet);
  const usedIds = new Set<string>();
  const clips = coalesced.map((segment) => {
    let id = canonicalPieceId(rootId, segment.start, baseFamily, unionCuts);
    while (usedIds.has(id)) id = `${id}@${segment.start}`;
    usedIds.add(id);
    return toClip(
      segment.normalized,
      id,
      segment.start,
      segment.end,
      ctx.base.projectRate,
    );
  });

  if (clips.length === 0) {
    if (ctx.conflicts.size > conflictsBefore) return [];
    const choice = valueConflict(ctx, {
      trackId,
      trackIndex,
      rootId,
      clipIds: allIds,
      field: "nonpositive-duration",
      timelineStart: startHint,
    });
    return choice === undefined
      ? []
      : chooseFamily(choice, baseFamily, oursFamily, theirsFamily);
  }

  const violation = familyJointViolation(ctx.base, trackId, clips);
  if (!violation) return clips;
  const field = violationField(violation);
  if (field === null) {
    ctx.invalidChoice = `unsupported merge invariant ${violation.kind}`;
    return [];
  }
  const choice = valueConflict(ctx, {
    trackId,
    trackIndex,
    rootId,
    clipIds: allIds,
    field,
    timelineStart: startHint,
  });
  return choice === undefined
    ? []
    : chooseFamily(choice, baseFamily, oursFamily, theirsFamily);
}

function sortedClips(clips: AnyClip[]): AnyClip[] {
  return [...clips].sort(
    (a, b) =>
      timelineStart(a) - timelineStart(b) ||
      timelineEnd(a) - timelineEnd(b) ||
      a.lineage.rootId.localeCompare(b.lineage.rootId) ||
      spanStart(a) - spanStart(b) ||
      a.id.localeCompare(b.id),
  );
}

function composeTimeline(ctx: MergeContext): Timeline {
  const baseFamilies = indexFamilies(ctx.base);
  const oursFamilies = indexFamilies(ctx.ours);
  const theirsFamilies = indexFamilies(ctx.theirs);
  const roots = [
    ...new Set([
      ...baseFamilies.keys(),
      ...oursFamilies.keys(),
      ...theirsFamilies.keys(),
    ]),
  ].sort((a, b) => {
    const fa =
      baseFamilies.get(a) ?? oursFamilies.get(a) ?? theirsFamilies.get(a)!;
    const fb =
      baseFamilies.get(b) ?? oursFamilies.get(b) ?? theirsFamilies.get(b)!;
    return fa.trackIndex - fb.trackIndex || a.localeCompare(b);
  });
  const byTrack = new Map<string, AnyClip[]>();
  for (const rootId of roots) {
    const familyClips = mergeFamily(
      ctx,
      baseFamilies.get(rootId),
      oursFamilies.get(rootId),
      theirsFamilies.get(rootId),
    );
    const family =
      baseFamilies.get(rootId) ??
      oursFamilies.get(rootId) ??
      theirsFamilies.get(rootId)!;
    const list = byTrack.get(family.trackId);
    if (list) list.push(...familyClips);
    else byTrack.set(family.trackId, familyClips);
  }
  return {
    projectRate: ctx.base.projectRate,
    mediaRefs: clone(ctx.base.mediaRefs),
    tracks: ctx.base.tracks.map((track) => ({
      ...clone(track),
      clips: sortedClips(byTrack.get(track.id) ?? []) as Track["clips"],
    })),
  };
}

type ClipLocation = { track: Track; trackIndex: number; clip: AnyClip };

function locate(timeline: Timeline, clipId: string): ClipLocation | undefined {
  for (let trackIndex = 0; trackIndex < timeline.tracks.length; trackIndex++) {
    const track = timeline.tracks[trackIndex];
    const clips: readonly AnyClip[] = track.clips;
    const clip = clips.find((item) => item.id === clipId);
    if (clip) return { track, trackIndex, clip };
  }
  return undefined;
}

function replaceTrackClips(
  timeline: Timeline,
  trackId: string,
  clips: AnyClip[],
): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      track.id === trackId
        ? { ...track, clips: sortedClips(clips) as Track["clips"] }
        : track,
    ),
  };
}

function replaceClip(
  timeline: Timeline,
  clipId: string,
  replacement: AnyClip | null,
  replacementTrackId?: string,
): Timeline {
  const current = locate(timeline, clipId);
  let next = timeline;
  if (current) {
    const clips: readonly AnyClip[] = current.track.clips;
    next = replaceTrackClips(
      next,
      current.track.id,
      clips.filter((clip) => clip.id !== clipId),
    );
  }
  if (replacement) {
    const trackId = replacementTrackId ?? current?.track.id;
    if (!trackId) return next;
    const track = next.tracks.find((item) => item.id === trackId);
    if (!track) return next;
    const clips: readonly AnyClip[] = track.clips;
    next = replaceTrackClips(next, trackId, [...clips, clone(replacement)]);
  }
  return next;
}

function overlapPairs(timeline: Timeline): OverlapParticipants[] {
  const pairs: OverlapParticipants[] = [];
  for (const track of timeline.tracks) {
    const clips: readonly AnyClip[] = track.clips;
    for (let i = 0; i < clips.length; i++) {
      for (let j = i + 1; j < clips.length; j++) {
        const a = clips[i];
        const b = clips[j];
        if (
          timelineStart(a) < timelineEnd(b) &&
          timelineStart(b) < timelineEnd(a)
        ) {
          const ids = [a.id, b.id].sort();
          pairs.push({
            kind: "overlap",
            trackId: track.id,
            clipIds: [ids[0], ids[1]],
          });
        }
      }
    }
  }
  return pairs;
}

function overlapConflict(
  timeline: Timeline,
  participants: OverlapParticipants,
): InternalConflict {
  const a = locate(timeline, participants.clipIds[0]);
  const b = locate(timeline, participants.clipIds[1]);
  const conflictId = encodedConflictId([
    "overlap",
    participants.trackId,
    participants.clipIds[0],
    participants.clipIds[1],
  ]);
  const starts = [a?.clip, b?.clip]
    .filter(Boolean)
    .map((clip) => timelineStart(clip!));
  const roots = [a?.clip.lineage.rootId, b?.clip.lineage.rootId]
    .filter((value): value is string => value !== undefined)
    .sort();
  return {
    public: {
      conflictId,
      bucket: 3,
      participants,
      explanation: `Clips ${participants.clipIds[0]} and ${participants.clipIds[1]} overlap`,
      choices: OVERLAP_CHOICES,
    },
    trackIndex: a?.trackIndex ?? b?.trackIndex ?? 0,
    timelineStart: starts.length > 0 ? Math.min(...starts) : 0,
    rootId: roots[0] ?? "",
    clipId: participants.clipIds[0],
    fieldOrder: FIELD_ORDER.length + 1,
  };
}

function nearestFreeStart(timeline: Timeline, clipId: string): number | null {
  const loc = locate(timeline, clipId);
  if (!loc) return null;
  const duration = loc.clip.timelineRange.duration.value;
  const current = timelineStart(loc.clip);
  const obstacles: Array<[number, number]> = [];
  const clips: readonly AnyClip[] = loc.track.clips;
  for (const clip of clips) {
    if (clip.id !== clipId)
      obstacles.push([timelineStart(clip), timelineEnd(clip)]);
  }
  obstacles.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const interval of obstacles) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1])
      last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }

  let left: number | null = null;
  let right: number | null = null;
  let gapStart = 0;
  for (const [occupiedStart, occupiedEnd] of merged) {
    if (occupiedStart - gapStart >= duration) {
      const latest = occupiedStart - duration;
      if (latest < current && (left === null || latest > left)) left = latest;
      if (gapStart > current && (right === null || gapStart < right))
        right = gapStart;
    }
    gapStart = Math.max(gapStart, occupiedEnd);
  }
  if (gapStart < current)
    left = left === null ? gapStart : Math.max(left, gapStart);
  else if (gapStart > current)
    right = right === null ? gapStart : Math.min(right, gapStart);
  else right = gapStart;

  if (left !== null && left < 0) left = null;
  if (left === null) return right;
  if (right === null) return left;
  const leftDistance = current - left;
  const rightDistance = right - current;
  return leftDistance <= rightDistance ? left : right;
}

function shiftClip(timeline: Timeline, clipId: string): Timeline {
  const loc = locate(timeline, clipId);
  if (!loc) return timeline;
  const start = nearestFreeStart(timeline, clipId);
  if (start === null) return timeline;
  const shifted: AnyClip = {
    ...loc.clip,
    timelineRange: {
      ...loc.clip.timelineRange,
      start: { value: start, rate: timeline.projectRate },
    },
  };
  return replaceClip(timeline, clipId, shifted, loc.track.id);
}

function revertPairToBase(
  timeline: Timeline,
  base: Timeline,
  ids: readonly [string, string],
): Timeline {
  let next = timeline;
  for (const id of ids) {
    const baseLoc = locate(base, id);
    next = replaceClip(
      next,
      id,
      baseLoc ? baseLoc.clip : null,
      baseLoc?.track.id,
    );
  }
  return next;
}

function applyOverlapChoice(
  timeline: Timeline,
  base: Timeline,
  participants: OverlapParticipants,
  choice: OverlapChoice,
): Timeline {
  if (choice === "base") {
    return revertPairToBase(timeline, base, participants.clipIds);
  }
  return shiftClip(
    timeline,
    choice === "shift-a" ? participants.clipIds[0] : participants.clipIds[1],
  );
}

function compareConflicts(a: InternalConflict, b: InternalConflict): number {
  return (
    a.trackIndex - b.trackIndex ||
    a.timelineStart - b.timelineStart ||
    a.rootId.localeCompare(b.rootId) ||
    a.clipId.localeCompare(b.clipId) ||
    a.fieldOrder - b.fieldOrder ||
    a.public.conflictId.localeCompare(b.public.conflictId)
  );
}

function overlapStateFingerprint(timeline: Timeline): string {
  return fingerprint(
    timeline.tracks.map((track) => ({
      id: track.id,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        start: clip.timelineRange.start.value,
        duration: clip.timelineRange.duration.value,
      })),
    })),
  );
}

function processOverlaps(ctx: MergeContext, input: Timeline): Timeline {
  let timeline = input;
  const appliedStates = new Set<string>();
  const choiceCount = Object.keys(ctx.choices).length;
  const maxPasses = Math.max(64, choiceCount * choiceCount * 2 + 32);
  for (let pass = 0; pass < maxPasses; pass++) {
    const overlaps = overlapPairs(timeline)
      .map((participants) => overlapConflict(timeline, participants))
      .sort(compareConflicts);
    const state = overlapStateFingerprint(timeline);
    const answered = overlaps.find(
      (conflict) =>
        ctx.choices[conflict.public.conflictId] !== undefined &&
        !appliedStates.has(`${conflict.public.conflictId}\u0000${state}`),
    );
    if (!answered) {
      for (const conflict of overlaps) {
        const saved = ctx.choices[conflict.public.conflictId];
        if (saved !== undefined && !conflict.public.choices.includes(saved)) {
          ctx.invalidChoice = `choice ${saved} is invalid for conflict ${conflict.public.conflictId}`;
        } else if (saved !== undefined) {
          ctx.invalidChoice =
            "saved overlap choices did not reach a clean fixed point";
        } else if (saved === undefined) {
          ctx.conflicts.set(conflict.public.conflictId, conflict);
        }
      }
      if (Object.keys(ctx.choices).length === 0 && overlaps.length > 0) {
        const pendingIds = new Set(
          overlaps.flatMap((conflict) => [
            ...(conflict.public.participants as OverlapParticipants).clipIds,
          ]),
        );
        for (const id of pendingIds) timeline = replaceClip(timeline, id, null);
      }
      return timeline;
    }
    const choice = ctx.choices[answered.public.conflictId] as OverlapChoice;
    if (!answered.public.choices.includes(choice)) {
      ctx.invalidChoice = `choice ${choice} is invalid for conflict ${answered.public.conflictId}`;
      return timeline;
    }
    appliedStates.add(`${answered.public.conflictId}\u0000${state}`);
    timeline = applyOverlapChoice(
      timeline,
      ctx.base,
      answered.public.participants as OverlapParticipants,
      choice,
    );
  }
  ctx.invalidChoice = "merge resolution did not terminate";
  return timeline;
}

function failure(message: string): MergeFailure {
  return {
    ok: false,
    error: { code: "E_MERGE_PRECONDITION", message },
  };
}

function canonicalChoices(choices: MergeChoices): MergeChoices {
  return Object.fromEntries(
    Object.entries(choices).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function recompute(
  baseInput: Timeline,
  oursInput: Timeline,
  theirsInput: Timeline,
  choices: MergeChoices,
): MergeResult {
  // Exercise the private lossless delta boundary used by merge and T3.
  const base = clone(baseInput);
  const ours = applyDelta(base, makeDelta(base, oursInput));
  const theirs = applyDelta(base, makeDelta(base, theirsInput));
  const ctx: MergeContext = {
    base,
    ours,
    theirs,
    choices: canonicalChoices(choices),
    conflicts: new Map(),
    invalidChoice: null,
  };
  let timeline = composeTimeline(ctx);
  timeline = processOverlaps(ctx, timeline);
  if (ctx.invalidChoice) return failure(ctx.invalidChoice);

  const conflicts = [...ctx.conflicts.values()]
    .sort(compareConflicts)
    .map((conflict) => conflict.public);
  const counts = {
    resolved: Object.keys(choices).length,
    remaining: conflicts.length,
    total: Object.keys(choices).length + conflicts.length,
  };
  if (conflicts.length === 0) {
    const violations = checkInvariants(timeline);
    if (violations.length > 0) {
      return failure(`final merge timeline is invalid: ${violations[0].kind}`);
    }
  }
  return {
    ok: true,
    status: conflicts.length === 0 ? "ready" : "needs-resolution",
    timeline,
    conflicts,
    choices: canonicalChoices(choices),
    counts,
  };
}

export function startMerge(input: StartMergeInput): MergeResult {
  return recompute(input.base, input.ours, input.theirs, {});
}

export function applyChoice(input: ApplyChoiceInput): MergeResult {
  const saved = input.choices[input.conflictId];
  if (saved !== undefined) {
    if (saved !== input.choice) {
      return failure(
        `conflict ${input.conflictId} already has a permanent answer`,
      );
    }
    return recompute(input.base, input.ours, input.theirs, input.choices);
  }
  const current = recompute(
    input.base,
    input.ours,
    input.theirs,
    input.choices,
  );
  if (!current.ok) return current;
  const conflict = current.conflicts.find(
    (item) => item.conflictId === input.conflictId,
  );
  if (!conflict) {
    return failure(`conflict ${input.conflictId} is not currently unanswered`);
  }
  if (!conflict.choices.includes(input.choice)) {
    return failure(
      `choice ${input.choice} is invalid for conflict ${input.conflictId}`,
    );
  }
  return recompute(input.base, input.ours, input.theirs, {
    ...input.choices,
    [input.conflictId]: input.choice,
  });
}

export function finalizeCheck(input: FinalizeCheckInput): FinalizeResult {
  const result = recompute(input.base, input.ours, input.theirs, input.choices);
  if (!result.ok) return result;
  if (result.status !== "ready") {
    return failure(`${result.counts.remaining} merge conflict(s) remain`);
  }
  const violations = checkInvariants(result.timeline);
  if (violations.length > 0) {
    return failure(`final merge timeline is invalid: ${violations[0].kind}`);
  }
  return { ok: true, timeline: result.timeline };
}
