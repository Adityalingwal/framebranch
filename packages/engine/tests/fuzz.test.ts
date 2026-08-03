/**
 * T3 — seeded M4 fuzz harness.
 *
 * Normal `pnpm test` excludes this file. Run it through the package `fuzz`
 * script so local runs execute 500 cases and CI executes 10,000 cases.
 */

import { describe, expect, it } from "vitest";
import {
  applyChoice,
  applyCommand,
  computeDiff,
  finalizeCheck,
  startMerge,
} from "../src/index";
import type {
  Clip,
  Command,
  MediaRef,
  MergeChoice,
  MergeConflict,
  MergeSuccess,
  TextClip,
  Timeline,
  Track,
  TrackKind,
} from "../src/index";
import { checkInvariants } from "../src/invariants";
import { applyDelta, makeDelta } from "../src/merge";

const RATE = 24;
const DEFAULT_SEED = 0x4d345f54;

type AnyClip = Clip | TextClip;
type FuzzEnvironment = {
  CI?: string;
  FRAMEBRANCH_FUZZ_CASE?: string;
  FRAMEBRANCH_FUZZ_CASES?: string;
  FRAMEBRANCH_FUZZ_OFFSET?: string;
  FRAMEBRANCH_FUZZ_SEED?: string;
  FRAMEBRANCH_FUZZ_TOTAL?: string;
};

const environment = (
  globalThis as typeof globalThis & {
    process?: { env?: FuzzEnvironment };
  }
).process?.env;

function parseInteger(
  name: string,
  raw: string | undefined,
  fallback: number,
  minimum: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer >= ${minimum}; received ${raw}`,
    );
  }
  return value;
}

const masterSeed =
  parseInteger(
    "FRAMEBRANCH_FUZZ_SEED",
    environment?.FRAMEBRANCH_FUZZ_SEED,
    DEFAULT_SEED,
    0,
  ) >>> 0;
const configuredCases = parseInteger(
  "FRAMEBRANCH_FUZZ_CASES",
  environment?.FRAMEBRANCH_FUZZ_CASES,
  environment?.CI === "true" ? 10_000 : 500,
  1,
);
const caseOffset = parseInteger(
  "FRAMEBRANCH_FUZZ_OFFSET",
  environment?.FRAMEBRANCH_FUZZ_OFFSET,
  0,
  0,
);
const configuredTotal = parseInteger(
  "FRAMEBRANCH_FUZZ_TOTAL",
  environment?.FRAMEBRANCH_FUZZ_TOTAL,
  configuredCases,
  configuredCases,
);
const replayCase =
  environment?.FRAMEBRANCH_FUZZ_CASE === undefined
    ? null
    : parseInteger(
        "FRAMEBRANCH_FUZZ_CASE",
        environment.FRAMEBRANCH_FUZZ_CASE,
        0,
        0,
      );

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  int(minimum: number, maximum: number): number {
    if (maximum < minimum) throw new Error("invalid RNG integer range");
    return minimum + Math.floor(this.next() * (maximum - minimum + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("cannot pick from an empty list");
    return values[this.int(0, values.length - 1)];
  }
}

const time = (value: number) => ({ value, rate: RATE });
const range = (start: number, duration: number) => ({
  start: time(start),
  duration: time(duration),
});
const fingerprint = (value: unknown): string => JSON.stringify(value);

function caseSeed(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function shuffled<T>(rng: Rng, input: readonly T[]): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index--) {
    const other = rng.int(0, index);
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

const MEDIA_REFS: readonly MediaRef[] = [
  {
    id: "media-video",
    kind: "video",
    url: "mem://video.mp4",
    hash: "video-hash",
    sourceRate: RATE,
    durationInSource: time(2_000),
  },
  {
    id: "media-audio",
    kind: "audio",
    url: "mem://audio.wav",
    hash: "audio-hash",
    sourceRate: RATE,
    durationInSource: time(2_000),
  },
  {
    id: "media-image",
    kind: "image",
    url: "mem://image.png",
    hash: "image-hash",
    sourceRate: RATE,
    durationInSource: time(2_000),
  },
];

const TRACK_RANK: Readonly<Record<TrackKind, number>> = {
  video: 0,
  audio: 1,
  text: 2,
};

function randomProperties(
  rng: Rng,
  mediaKind: MediaRef["kind"],
): Clip["properties"] {
  const properties: Clip["properties"] = {};
  if (mediaKind === "video" && rng.chance(0.35)) {
    properties.volume = rng.chance(0.4) ? 100 : rng.int(0, 100);
  }
  if (mediaKind !== "audio" && rng.chance(0.35)) {
    properties.opacity = rng.chance(0.4) ? 100 : rng.int(0, 100);
  }
  if (mediaKind !== "audio" && rng.chance(0.3)) {
    properties.scale = rng.chance(0.4) ? 1 : rng.int(1, 30) / 10;
  }
  if (mediaKind !== "audio" && rng.chance(0.3)) {
    properties.position = { x: rng.int(-100, 100), y: rng.int(-100, 100) };
  }
  return properties;
}

function makeBaseTimeline(rng: Rng, index: number): Timeline {
  const trackCount = rng.int(1, 3);
  const kinds = shuffled<TrackKind>(rng, ["video", "audio", "text"])
    .slice(0, trackCount)
    .sort((left, right) => TRACK_RANK[left] - TRACK_RANK[right]);
  const tracks: Track[] = kinds.map((kind, trackIndex) => ({
    id: `${kind[0]}-${trackIndex}`,
    kind,
    clips: [],
  }));
  const nextStart = new Map(tracks.map((track) => [track.id, rng.int(0, 3)]));
  const clipCount = rng.int(0, 30);

  for (let clipIndex = 0; clipIndex < clipCount; clipIndex++) {
    const track = rng.pick(tracks);
    const duration = rng.int(1, 12);
    const start = nextStart.get(track.id) ?? 0;
    const id = `r${index}c${clipIndex}`;
    let clip: AnyClip;
    if (track.kind === "text") {
      clip = {
        id,
        timelineRange: range(start, duration),
        textContent: `text-${index}-${clipIndex}`,
        textStyle: {
          font: rng.pick(["Arial", "Georgia", "Courier New"] as const),
          size: rng.int(8, 80),
          color: rng.pick(["#ffffff", "#00ff00", "#ff00ff"] as const),
        },
        ...(rng.chance(0.35)
          ? {
              properties: {
                opacity: rng.chance(0.4) ? 100 : rng.int(0, 100),
                position: { x: rng.int(-100, 100), y: rng.int(-100, 100) },
              },
            }
          : {}),
        lineage: { rootId: id, span: range(0, duration) },
      };
    } else {
      const media =
        track.kind === "audio"
          ? MEDIA_REFS[1]
          : rng.pick([MEDIA_REFS[0], MEDIA_REFS[2]]);
      const sourceStart = rng.int(0, media.durationInSource.value - duration);
      clip = {
        id,
        mediaRefId: media.id,
        sourceRange: range(sourceStart, duration),
        timelineRange: range(start, duration),
        properties: randomProperties(rng, media.kind),
        lineage: { rootId: id, span: range(0, duration) },
      };
    }
    (track.clips as AnyClip[]).push(clip);
    nextStart.set(track.id, start + duration + rng.int(0, 4));
  }

  return {
    projectRate: RATE,
    tracks,
    mediaRefs: MEDIA_REFS.map((media) => ({ ...media })),
  };
}

function clips(timeline: Timeline): AnyClip[] {
  return timeline.tracks.flatMap((track) => track.clips as AnyClip[]);
}

function mediaFor(timeline: Timeline, clip: Clip): MediaRef {
  const media = timeline.mediaRefs.find((item) => item.id === clip.mediaRefId);
  if (!media) throw new Error(`media ${clip.mediaRefId} not found`);
  return media;
}

function trackFor(timeline: Timeline, clipId: string): Track {
  const track = timeline.tracks.find((item) =>
    (item.clips as AnyClip[]).some((clip) => clip.id === clipId),
  );
  if (!track) throw new Error(`track for ${clipId} not found`);
  return track;
}

function maximumEnd(track: Track): number {
  return (track.clips as AnyClip[]).reduce(
    (maximum, clip) =>
      Math.max(
        maximum,
        clip.timelineRange.start.value + clip.timelineRange.duration.value,
      ),
    0,
  );
}

type GeneratedCommand = {
  command: Command;
  mintedId?: string;
};

function makeAddCommand(
  timeline: Timeline,
  rng: Rng,
  id: string,
): GeneratedCommand {
  const track = rng.pick(timeline.tracks);
  const duration = rng.int(1, 10);
  const start = maximumEnd(track) + rng.int(0, 4);
  if (track.kind === "text") {
    return {
      command: {
        op: "addClip",
        trackId: track.id,
        textContent: `added-${id}`,
        textStyle: {
          font: rng.pick(["Arial", "Georgia", "Courier New"] as const),
          size: rng.int(8, 80),
          color: "#ffffff",
        },
        timelineRange: range(start, duration),
      },
      mintedId: id,
    };
  }
  const media =
    track.kind === "audio"
      ? MEDIA_REFS[1]
      : rng.pick([MEDIA_REFS[0], MEDIA_REFS[2]]);
  return {
    command: {
      op: "addClip",
      trackId: track.id,
      mediaRefId: media.id,
      sourceRange: range(rng.int(0, 2_000 - duration), duration),
      timelineRange: range(start, duration),
    },
    mintedId: id,
  };
}

function makePropertyCommand(
  timeline: Timeline,
  rng: Rng,
  clip: AnyClip,
): Command {
  if ("textContent" in clip) {
    const property = rng.pick([
      "opacity",
      "position",
      "textContent",
      "textStyle",
    ] as const);
    const value =
      property === "opacity"
        ? rng.int(0, 100)
        : property === "position"
          ? { x: rng.int(-200, 200), y: rng.int(-200, 200) }
          : property === "textContent"
            ? `changed-${rng.int(0, 1_000_000)}`
            : {
                font: rng.pick(["Arial", "Georgia", "Courier New"] as const),
                size: rng.int(8, 200),
                color: rng.pick(["#ffffff", "#112233", "#abcdef"] as const),
              };
    return { op: "propertyChange", clipId: clip.id, property, value };
  }

  const media = mediaFor(timeline, clip);
  const applicable =
    media.kind === "audio"
      ? (["volume"] as const)
      : media.kind === "image"
        ? (["opacity", "scale", "position"] as const)
        : (["volume", "opacity", "scale", "position"] as const);
  const property = rng.pick(applicable);
  const value =
    property === "volume" || property === "opacity"
      ? rng.int(0, 100)
      : property === "scale"
        ? rng.int(1, 100) / 10
        : { x: rng.int(-200, 200), y: rng.int(-200, 200) };
  return { op: "propertyChange", clipId: clip.id, property, value };
}

function makeAwareCommand(
  timeline: Timeline,
  rng: Rng,
  branch: string,
  step: number,
): GeneratedCommand {
  const allClips = clips(timeline);
  if (allClips.length === 0 || rng.chance(0.2)) {
    return makeAddCommand(timeline, rng, `${branch}n${step}`);
  }

  const operation = rng.pick([
    "move",
    "trim",
    "slip",
    "property",
    "split",
    "delete",
    "ripple",
  ] as const);
  const clip = rng.pick(allClips);

  if (operation === "move") {
    const track = trackFor(timeline, clip.id);
    return {
      command: {
        op: "move",
        clipId: clip.id,
        newStart: time(maximumEnd(track) + rng.int(0, 4)),
      },
    };
  }
  if (operation === "trim" && clip.timelineRange.duration.value > 1) {
    return {
      command: {
        op: "trim",
        clipId: clip.id,
        edge: rng.pick(["start", "end"] as const),
        delta: time(-rng.int(1, clip.timelineRange.duration.value - 1)),
      },
    };
  }
  if (operation === "slip" && !("textContent" in clip)) {
    const media = mediaFor(timeline, clip);
    const minimum = -clip.sourceRange.start.value;
    const maximum =
      media.durationInSource.value -
      clip.sourceRange.start.value -
      clip.sourceRange.duration.value;
    return {
      command: {
        op: "slip",
        clipId: clip.id,
        delta: time(rng.int(minimum, maximum)),
      },
    };
  }
  if (operation === "property") {
    return { command: makePropertyCommand(timeline, rng, clip) };
  }
  if (operation === "split" && clip.timelineRange.duration.value > 1) {
    const start = clip.timelineRange.start.value;
    return {
      command: {
        op: "split",
        clipId: clip.id,
        at: time(
          rng.int(start + 1, start + clip.timelineRange.duration.value - 1),
        ),
      },
    };
  }
  if (operation === "ripple") {
    return { command: { op: "rippleDelete", clipId: clip.id } };
  }
  if (operation === "delete") {
    return { command: { op: "deleteClip", clipId: clip.id } };
  }
  return { command: makePropertyCommand(timeline, rng, clip) };
}

function makeBlindCommand(
  timeline: Timeline,
  rng: Rng,
  branch: string,
  step: number,
): GeneratedCommand {
  const allClips = clips(timeline);
  const choice = rng.int(0, 3);
  if (choice === 0 || allClips.length === 0) {
    return {
      command: { op: "deleteClip", clipId: `missing-${branch}-${step}` },
    };
  }
  if (choice === 1) {
    const clip = rng.pick(allClips);
    return {
      command: {
        op: "split",
        clipId: clip.id,
        at: clip.timelineRange.start,
      },
    };
  }
  if (choice === 2) {
    const clip = rng.pick(allClips);
    return {
      command: {
        op: "move",
        clipId: clip.id,
        newStart: { value: 0, rate: RATE + 1 },
      },
    };
  }
  return {
    command: {
      op: "propertyChange",
      clipId: `missing-${branch}-${step}`,
      property: "opacity",
      value: 50,
    },
  };
}

function assertLineageAndUniqueIds(timeline: Timeline, label: string): void {
  const ids = new Set<string>();
  for (const clip of clips(timeline)) {
    if (ids.has(clip.id))
      throw new Error(
        `${label}: duplicate clip id ${clip.id}; timeline=${fingerprint(timeline)}`,
      );
    ids.add(clip.id);
    if (clip.lineage.span.duration.value <= 0) {
      throw new Error(
        `${label}: clip ${clip.id} has nonpositive lineage span duration`,
      );
    }
  }
}

function assertInvariantClean(timeline: Timeline, label: string): void {
  const violations = checkInvariants(timeline);
  if (violations.length > 0) {
    throw new Error(`${label}: invariant violation ${violations[0].kind}`);
  }
}

function editBranch(base: Timeline, rng: Rng, branch: string): Timeline {
  let timeline = base;
  const steps = rng.int(5, 50);
  for (let step = 0; step < steps; step++) {
    const generated = rng.chance(0.15)
      ? makeBlindCommand(timeline, rng, branch, step)
      : makeAwareCommand(timeline, rng, branch, step);
    const result = applyCommand(
      timeline,
      generated.command,
      generated.mintedId === undefined
        ? undefined
        : { mintId: () => generated.mintedId as string },
    );
    if (result.ok) {
      timeline = result.timeline;
      assertInvariantClean(timeline, `${branch} edit ${step}`);
      assertLineageAndUniqueIds(timeline, `${branch} edit ${step}`);
    }
  }
  return timeline;
}

const EXPECTED_CHOICES: Readonly<Record<1 | 2 | 3, readonly MergeChoice[]>> = {
  1: ["ours", "theirs", "base"],
  2: ["delete", "clip", "base"],
  3: ["shift-a", "shift-b", "base"],
};

function assertConflictShape(conflict: MergeConflict): void {
  if (![1, 2, 3].includes(conflict.bucket)) {
    throw new Error(`unbucketed conflict ${conflict.conflictId}`);
  }
  if (
    fingerprint(conflict.choices) !==
    fingerprint(EXPECTED_CHOICES[conflict.bucket])
  ) {
    throw new Error(`wrong choices for bucket ${conflict.bucket}`);
  }
  const expectedKind =
    conflict.bucket === 1
      ? "value"
      : conflict.bucket === 2
        ? "delete"
        : "overlap";
  if (conflict.participants.kind !== expectedKind) {
    throw new Error(
      `bucket ${conflict.bucket} has ${conflict.participants.kind} participants`,
    );
  }
}

function expectMergeSuccess(
  result: ReturnType<typeof startMerge>,
  label: string,
): MergeSuccess {
  if (!result.ok) {
    throw new Error(`${label}: ${result.error.code}: ${result.error.message}`);
  }
  if (result.counts.resolved !== Object.keys(result.choices).length) {
    throw new Error(`${label}: resolved count is dishonest`);
  }
  if (result.counts.remaining !== result.conflicts.length) {
    throw new Error(`${label}: remaining count is dishonest`);
  }
  if (
    result.counts.total !==
    result.counts.resolved + result.counts.remaining
  ) {
    throw new Error(`${label}: total count is dishonest`);
  }
  const conflictIds = new Set<string>();
  for (const conflict of result.conflicts) {
    assertConflictShape(conflict);
    if (conflictIds.has(conflict.conflictId)) {
      throw new Error(`${label}: duplicate conflict id ${conflict.conflictId}`);
    }
    conflictIds.add(conflict.conflictId);
  }
  assertLineageAndUniqueIds(result.timeline, `${label} draft`);
  return result;
}

function rootIds(timeline: Timeline): Set<string> {
  return new Set(clips(timeline).map((clip) => clip.lineage.rootId));
}

function assertNoSilentResurrection(
  base: Timeline,
  ours: Timeline,
  theirs: Timeline,
  merged: Timeline,
): void {
  const oursRoots = rootIds(ours);
  const theirsRoots = rootIds(theirs);
  const mergedRoots = rootIds(merged);
  for (const rootId of rootIds(base)) {
    if (
      !oursRoots.has(rootId) &&
      !theirsRoots.has(rootId) &&
      mergedRoots.has(rootId)
    ) {
      throw new Error(`root ${rootId} was silently resurrected`);
    }
  }
}

function resolveMerge(
  base: Timeline,
  ours: Timeline,
  theirs: Timeline,
  rng: Rng,
): { result: MergeSuccess; choices: Readonly<Record<string, MergeChoice>> } {
  const first = expectMergeSuccess(
    startMerge({ base, ours, theirs }),
    "initial merge",
  );
  const repeated = expectMergeSuccess(
    startMerge({ base, ours, theirs }),
    "repeated initial merge",
  );
  expect(fingerprint(repeated)).toBe(fingerprint(first));

  if (first.conflicts.length > 0) {
    const earlyFinalize = finalizeCheck({ base, ours, theirs, choices: {} });
    if (
      earlyFinalize.ok ||
      earlyFinalize.error.code !== "E_MERGE_PRECONDITION"
    ) {
      throw new Error("finalizeCheck accepted an unresolved merge");
    }
  }

  let current = first;
  let choices: Readonly<Record<string, MergeChoice>> = {};
  const answered = new Set<string>();
  const clipCount = new Set([
    ...clips(base).map((clip) => clip.id),
    ...clips(ours).map((clip) => clip.id),
    ...clips(theirs).map((clip) => clip.id),
  ]).size;
  const maximumAnswers = Math.max(128, clipCount * clipCount * 4);

  while (current.conflicts.length > 0) {
    if (answered.size >= maximumAnswers) {
      throw new Error(
        `merge did not terminate within ${maximumAnswers} answers`,
      );
    }
    const conflict = rng.pick(current.conflicts);
    if (answered.has(conflict.conflictId)) {
      throw new Error(
        `answered conflict ${conflict.conflictId} returned unresolved`,
      );
    }
    const choice = rng.pick(conflict.choices);
    const next = applyChoice({
      base,
      ours,
      theirs,
      choices,
      conflictId: conflict.conflictId,
      choice,
    });
    answered.add(conflict.conflictId);
    current = expectMergeSuccess(next, `answer ${answered.size}`);
    choices = current.choices;
  }

  if (current.status !== "ready") {
    throw new Error("conflict-free merge did not become ready");
  }
  return { result: current, choices };
}

function runCase(index: number, rootSeed = masterSeed): void {
  const seed = caseSeed(rootSeed, index);
  const rng = new Rng(seed);
  const base = makeBaseTimeline(rng, index);
  const baseBefore = fingerprint(base);
  assertInvariantClean(base, "base");
  assertLineageAndUniqueIds(base, "base");

  const ours = editBranch(base, new Rng(caseSeed(seed, 1)), `o${index}`);
  const theirs = editBranch(base, new Rng(caseSeed(seed, 2)), `t${index}`);
  if (fingerprint(base) !== baseBefore)
    throw new Error("branch edits mutated base");

  for (const [label, timeline] of [
    ["base", base],
    ["ours", ours],
    ["theirs", theirs],
  ] as const) {
    const selfDiff = computeDiff(timeline, timeline);
    if (selfDiff.entries.length !== 0 || selfDiff.sentences.length !== 0) {
      throw new Error(`${label}: diff(A, A) was not empty`);
    }
  }

  if (
    fingerprint(applyDelta(base, makeDelta(base, ours))) !== fingerprint(ours)
  ) {
    throw new Error("ours lossless delta round-trip failed");
  }
  if (
    fingerprint(applyDelta(base, makeDelta(base, theirs))) !==
    fingerprint(theirs)
  ) {
    throw new Error("theirs lossless delta round-trip failed");
  }

  const resolved = resolveMerge(base, ours, theirs, new Rng(caseSeed(seed, 3)));
  const finalized = finalizeCheck({
    base,
    ours,
    theirs,
    choices: resolved.choices,
  });
  if (!finalized.ok) {
    throw new Error(`finalize failed: ${finalized.error.message}`);
  }
  const repeatedFinal = finalizeCheck({
    base,
    ours,
    theirs,
    choices: resolved.choices,
  });
  if (!repeatedFinal.ok) {
    throw new Error(`repeated finalize failed: ${repeatedFinal.error.message}`);
  }
  expect(fingerprint(repeatedFinal)).toBe(fingerprint(finalized));
  expect(fingerprint(finalized.timeline)).toBe(
    fingerprint(resolved.result.timeline),
  );
  assertInvariantClean(finalized.timeline, "final merge");
  assertLineageAndUniqueIds(finalized.timeline, "final merge");
  assertNoSilentResurrection(base, ours, theirs, finalized.timeline);
}

function replayCommand(index: number): string {
  return [
    `FRAMEBRANCH_FUZZ_SEED=${masterSeed}`,
    `FRAMEBRANCH_FUZZ_CASE=${index}`,
    "pnpm --filter @framebranch/engine fuzz",
  ].join(" ");
}

describe("T3: seeded merge fuzz", () => {
  const caseIndexes =
    replayCase === null
      ? Array.from(
          { length: configuredCases },
          (_, index) => caseOffset + index,
        )
      : [replayCase];
  const chunks: number[][] = [];
  for (let start = 0; start < caseIndexes.length; start += 1_000) {
    chunks.push(caseIndexes.slice(start, start + 1_000));
  }

  it("T3 regression: a recurring saved B3 answer is replayed in its new state", () => {
    runCase(617, DEFAULT_SEED);
  });

  for (const chunk of chunks) {
    it(
      `T3: seed ${masterSeed} runs cases ${chunk[0]}-${chunk[chunk.length - 1]} (${configuredTotal} total)`,
      { timeout: 600_000 },
      () => {
        for (const index of chunk) {
          try {
            runCase(index);
          } catch (error) {
            const detail =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `T3 fuzz failure at case ${index} (case seed ${caseSeed(masterSeed, index)}).\n` +
                `Replay: ${replayCommand(index)}\n${detail}`,
              { cause: error },
            );
          }
        }
      },
    );
  }
});
