/**
 * T4 — Synthetic timeline generator for benchmarks.
 *
 * Creates valid, overlap-free timelines at configurable clip counts with
 * a mix of video, audio, and text tracks. Also provides a "split-heavy"
 * variant that simulates many split operations for merge stress testing.
 *
 * All timelines pass checkInvariants (overlap-free, positive durations,
 * source ranges within file bounds).
 */

const RATE = 24;

/** @returns {{ value: number, rate: number }} */
const time = (value) => ({ value, rate: RATE });

/** @returns {{ start: { value: number, rate: number }, duration: { value: number, rate: number } }} */
const range = (start, duration) => ({
  start: time(start),
  duration: time(duration),
});

/** Minimal seeded PRNG (same algo as fuzz.test.ts — deterministic). */
class Rng {
  /** @param {number} seed */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /** @returns {number} float in [0, 1) */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /**
   * @template T
   * @param {readonly T[]} values
   * @returns {T}
   */
  pick(values) {
    return values[this.int(0, values.length - 1)];
  }
}

const MEDIA_REFS = [
  {
    id: "bench-video",
    kind: "video",
    url: "mem://bench-video.mp4",
    hash: "bench-video-hash",
    sourceRate: RATE,
    durationInSource: time(500_000), // very large source file
  },
  {
    id: "bench-audio",
    kind: "audio",
    url: "mem://bench-audio.wav",
    hash: "bench-audio-hash",
    sourceRate: RATE,
    durationInSource: time(500_000),
  },
  {
    id: "bench-image",
    kind: "image",
    url: "mem://bench-image.png",
    hash: "bench-image-hash",
    sourceRate: RATE,
    durationInSource: time(500_000),
  },
];

/**
 * Generate a valid, overlap-free timeline with the given number of clips.
 *
 * Clips are distributed round-robin across tracks. Each clip is placed
 * after the previous one on the same track with a small gap (0–3 frames),
 * guaranteeing zero overlaps.
 *
 * @param {number} clipCount
 * @param {number} [seed=42]
 * @returns {import('../src/types.js').Timeline}
 */
export function generateTimeline(clipCount, seed = 42) {
  const rng = new Rng(seed);

  // Fixed set of tracks: 2 video, 1 audio, 1 text
  const tracks = [
    { id: "v0", kind: "video", clips: [] },
    { id: "v1", kind: "video", clips: [] },
    { id: "a0", kind: "audio", clips: [] },
    { id: "t0", kind: "text", clips: [] },
  ];

  // Track the next available start position per track
  const nextStart = new Map(tracks.map((t) => [t.id, 0]));

  for (let i = 0; i < clipCount; i++) {
    // Round-robin track assignment for even distribution
    const track = tracks[i % tracks.length];
    const duration = rng.int(3, 24); // 3–24 frames (0.125s – 1s at 24fps)
    const start = nextStart.get(track.id);
    const gap = rng.int(0, 3);
    const id = `b${i}`;

    if (track.kind === "text") {
      track.clips.push({
        id,
        timelineRange: range(start, duration),
        textContent: `text-${i}`,
        textStyle: { font: "Arial", size: 48, color: "#ffffff" },
        lineage: { rootId: id, span: range(0, duration) },
      });
    } else {
      const media =
        track.kind === "audio"
          ? MEDIA_REFS[1]
          : rng.pick([MEDIA_REFS[0], MEDIA_REFS[2]]);
      const sourceStart = rng.int(0, 10_000);
      const properties = {};
      if (media.kind === "video") {
        properties.volume = rng.int(0, 100);
      }
      if (media.kind !== "audio") {
        properties.opacity = rng.int(50, 100);
      }
      track.clips.push({
        id,
        mediaRefId: media.id,
        sourceRange: range(sourceStart, duration),
        timelineRange: range(start, duration),
        properties,
        lineage: { rootId: id, span: range(0, duration) },
      });
    }

    nextStart.set(track.id, start + duration + gap);
  }

  return {
    projectRate: RATE,
    tracks,
    mediaRefs: MEDIA_REFS.map((m) => ({ ...m })),
  };
}

/**
 * Generate a "split-heavy" timeline variant. This takes a generated
 * timeline and simulates many splits by creating families of 2–3
 * lineage-connected clips per original clip. This exercises the merge
 * engine's refinement/common-cut code paths.
 *
 * @param {number} clipCount - target clip count (actual may be slightly higher)
 * @param {number} [seed=99]
 * @returns {import('../src/types.js').Timeline}
 */
export function generateSplitHeavyTimeline(clipCount, seed = 99) {
  const rng = new Rng(seed);

  const tracks = [
    { id: "sv0", kind: "video", clips: [] },
    { id: "sv1", kind: "video", clips: [] },
    { id: "sa0", kind: "audio", clips: [] },
  ];

  const nextStart = new Map(tracks.map((t) => [t.id, 0]));
  let totalClips = 0;

  while (totalClips < clipCount) {
    const track = tracks[totalClips % tracks.length];
    const familyDuration = rng.int(12, 48); // wider clips to allow splits
    const start = nextStart.get(track.id);
    const gap = rng.int(0, 2);
    const rootId = `s${totalClips}`;

    const media =
      track.kind === "audio"
        ? MEDIA_REFS[1]
        : rng.pick([MEDIA_REFS[0], MEDIA_REFS[2]]);
    const sourceStart = rng.int(0, 10_000);

    // Split into 2 or 3 pieces
    const pieceCount = rng.int(2, 3);
    const pieceDurations = [];
    let remaining = familyDuration;
    for (let p = 0; p < pieceCount - 1; p++) {
      const d = rng.int(3, Math.max(4, remaining - (pieceCount - p) * 3));
      pieceDurations.push(d);
      remaining -= d;
    }
    pieceDurations.push(remaining);

    let pieceStart = start;
    let spanStart = 0;
    for (let p = 0; p < pieceDurations.length; p++) {
      const d = pieceDurations[p];
      const clipId = p === 0 ? rootId : `${rootId}@cut${spanStart}`;
      const properties = {};
      if (media.kind === "video") properties.volume = rng.int(0, 100);

      track.clips.push({
        id: clipId,
        mediaRefId: media.id,
        sourceRange: range(sourceStart + spanStart, d),
        timelineRange: range(pieceStart, d),
        properties,
        lineage: { rootId, span: range(spanStart, d) },
      });

      pieceStart += d;
      spanStart += d;
      totalClips++;
    }

    nextStart.set(track.id, pieceStart + gap);
  }

  return {
    projectRate: RATE,
    tracks,
    mediaRefs: MEDIA_REFS.map((m) => ({ ...m })),
  };
}

/**
 * Apply random edits to a timeline to produce a divergent version.
 * Edits are: move a few clips, trim some, change properties.
 * Returns a structurally valid new timeline.
 *
 * @param {import('../src/types.js').Timeline} timeline
 * @param {number} editCount
 * @param {number} [seed=7]
 * @param {{ excludeMove?: boolean }} [options] - `excludeMove: true` never
 *   picks the `move` edit type (only trim-end/property-change — the
 *   overlap-safe atoms, same reasoning as `generateConflictingPair`). When
 *   `excludeMove` is false (the default), behaviour and RNG call sequence
 *   are BYTE-IDENTICAL to before this option existed — no extra `rng` calls
 *   are made on that path, so every existing call site's fixtures/seeds are
 *   unaffected.
 * @returns {import('../src/types.js').Timeline}
 */
export function applyRandomEdits(
  timeline,
  editCount,
  seed = 7,
  { excludeMove = false } = {},
) {
  // Deep clone
  const tl = JSON.parse(JSON.stringify(timeline));
  const rng = new Rng(seed);

  const allClips = tl.tracks.flatMap((track) => track.clips);
  if (allClips.length === 0) return tl;

  for (let i = 0; i < editCount; i++) {
    const clip = rng.pick(allClips);
    let editType = rng.int(0, 2);
    if (excludeMove && editType === 0) {
      // Remap move → trim-end or property-change. This extra `rng` call
      // only happens when excludeMove is requested (a new call site), so
      // it never changes the sequence for excludeMove: false callers.
      editType = rng.int(0, 1) === 0 ? 1 : 2;
    }

    switch (editType) {
      case 0: {
        // Move: shift timeline start by 1–5 frames forward
        const shift = rng.int(1, 5);
        clip.timelineRange.start.value += shift;
        break;
      }
      case 1: {
        // Trim end: shorten by 1 frame (if duration > 2)
        if (clip.timelineRange.duration.value > 2) {
          clip.timelineRange.duration.value -= 1;
          if (clip.sourceRange) {
            clip.sourceRange.duration.value -= 1;
          }
          clip.lineage.span.duration.value -= 1;
        }
        break;
      }
      case 2: {
        // Property change: toggle volume or opacity
        if (clip.properties && clip.properties.volume !== undefined) {
          clip.properties.volume = rng.int(0, 100);
        } else if (clip.properties && clip.properties.opacity !== undefined) {
          clip.properties.opacity = rng.int(0, 100);
        }
        break;
      }
    }
  }

  return tl;
}

/**
 * Builds a conflicting pair of timelines where both sides edit the same clips
 * to different values, guaranteeing a value conflict on every edited clip.
 *
 * @param {import('../src/types.js').Timeline} timeline
 * @param {number} editCount - target number of conflicting clips (upper bound)
 * @param {number} seed
 * @returns {{ ours: import('../src/types.js').Timeline, theirs: import('../src/types.js').Timeline, expectedConflicts: number }}
 */
export function generateConflictingPair(timeline, editCount, seed) {
  const rng = new Rng(seed);

  // Independent deep clones — same track/clip order (both derived from the
  // same source timeline), so index-aligned iteration hits the SAME clip on
  // both sides.
  const ours = JSON.parse(JSON.stringify(timeline));
  const theirs = JSON.parse(JSON.stringify(timeline));

  const oursClips = ours.tracks.flatMap((track) => track.clips);
  const theirsClips = theirs.tracks.flatMap((track) => track.clips);

  // Deterministic Fisher-Yates shuffle of clip indices so the chosen clips
  // are spread across the timeline rather than always the first N.
  const indices = oursClips.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  let expectedConflicts = 0;
  for (const idx of indices) {
    if (expectedConflicts >= editCount) break;
    const a = oursClips[idx];
    const b = theirsClips[idx];

    if (a.properties && a.properties.volume !== undefined) {
      const base = a.properties.volume;
      a.properties.volume = (base + 37) % 101;
      b.properties.volume = (base + 71) % 101;
      expectedConflicts++;
    } else if (a.properties && a.properties.opacity !== undefined) {
      const base = a.properties.opacity;
      a.properties.opacity = (base + 37) % 101;
      b.properties.opacity = (base + 71) % 101;
      expectedConflicts++;
    } else if (a.timelineRange.duration.value > 3) {
      // Trim end (shorten only — can never introduce an overlap). Different
      // shorten amounts on each side guarantee different resulting values.
      a.timelineRange.duration.value -= 1;
      if (a.sourceRange) a.sourceRange.duration.value -= 1;
      a.lineage.span.duration.value -= 1;

      b.timelineRange.duration.value -= 2;
      if (b.sourceRange) b.sourceRange.duration.value -= 2;
      b.lineage.span.duration.value -= 2;
      expectedConflicts++;
    }
    // else: clip has no properties and is too short to trim safely — skip.
  }

  return { ours, theirs, expectedConflicts };
}
