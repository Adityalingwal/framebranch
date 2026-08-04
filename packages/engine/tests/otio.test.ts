/**
 * Group H — OTIO import/export goldens (docs/12 "M5 (OTIO) test
 * additions", locks O1-O10 in docs/11). Names carry their lock-ID prefix
 * per the docs/12 T1 convention.
 *
 * Warning assertions are on `code` ONLY — never on English prose (O8).
 */

import { describe, expect, it } from "vitest";
import { applyCommand } from "../src/verbs";
import { exportOtio, importOtio } from "../src/otio";
import type { ImportResult, OtioJson } from "../src/otio";
import type {
  Clip,
  MediaRef,
  TextClip,
  Timeline,
  TextStyle,
  Track,
} from "../src/types";
import {
  ALL_WHITELIST_LABELS_DOC,
  otioClip,
  otioGap,
  otioTextClip,
  otioTimeline,
  otioTrack,
  otioTransition,
  type Json,
} from "./otio-fixtures";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type AnyClip = Clip | TextClip;

function expectImported(result: ImportResult): {
  timeline: Timeline;
  warnings: { code: string; detail: string; count: number }[];
} {
  if (!result.ok) {
    throw new Error(`expected import success, got ${result.error.code}`);
  }
  return { timeline: result.timeline, warnings: result.warnings };
}

function expectImportError(result: ImportResult, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

const obj = (value: unknown, where: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`);
  }
  return value as Record<string, unknown>;
};

const list = (value: unknown, where: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${where}: expected an array`);
  return value;
};

/** Children of the nth exported track. */
function exportedTrack(doc: OtioJson, index: number): Record<string, unknown> {
  const stack = obj(doc.tracks, "tracks");
  return obj(list(stack.children, "tracks.children")[index], `track ${index}`);
}

function exportedChildren(
  doc: OtioJson,
  index: number,
): Record<string, unknown>[] {
  const track = exportedTrack(doc, index);
  return list(track.children, "track.children").map((child, i) =>
    obj(child, `child ${i}`),
  );
}

const durationOf = (node: Record<string, unknown>): number => {
  const range = obj(node.source_range, "source_range");
  return obj(range.duration, "duration").value as number;
};

const clipsOf = (timeline: Timeline, trackIndex: number): AnyClip[] =>
  timeline.tracks[trackIndex].clips as AnyClip[];

const mediaOf = (timeline: Timeline, clip: Clip): MediaRef => {
  const media = timeline.mediaRefs.find((m) => m.id === clip.mediaRefId);
  if (!media) throw new Error(`media ${clip.mediaRefId} not found`);
  return media;
};

const codes = (warnings: { code: string }[]): string[] =>
  warnings.map((w) => w.code);

// ---------------------------------------------------------------------------
// H1 — O4: gaps are a measurement on import, a real item on export
// ---------------------------------------------------------------------------

describe("O4/H1: gap import + export", () => {
  const doc = otioTimeline({
    tracks: [
      otioTrack({
        kind: "Video",
        children: [
          otioClip({
            sourceStart: 0,
            duration: 10,
            rate: 24,
            targetUrl: "file://a.mov",
            available: { start: 0, duration: 100, rate: 24 },
          }),
          otioGap(5, 24),
          otioClip({
            sourceStart: 20,
            duration: 8,
            rate: 24,
            targetUrl: "file://b.mov",
            available: { start: 0, duration: 100, rate: 24 },
          }),
        ],
      }),
    ],
  });

  it("O4/H1: [clip 10, gap 5, clip 8] imports as clips at 0-10 and 15-23", () => {
    const { timeline, warnings } = expectImported(importOtio(doc));
    const clips = clipsOf(timeline, 0);
    expect(clips.length).toBe(2);
    expect(clips[0].timelineRange).toEqual({
      start: { value: 0, rate: 24 },
      duration: { value: 10, rate: 24 },
    });
    expect(clips[1].timelineRange).toEqual({
      start: { value: 15, rate: 24 },
      duration: { value: 8, rate: 24 },
    });
    // A gap is not "skipped" — nothing was lost, so nothing is warned about.
    expect(warnings).toEqual([]);
  });

  it("O4/H1: exporting writes the 5-frame Gap.1 back between the clips", () => {
    const { timeline } = expectImported(importOtio(doc));
    const children = exportedChildren(exportOtio(timeline), 0);
    expect(children.map((c) => c.OTIO_SCHEMA)).toEqual([
      "Clip.1",
      "Gap.1",
      "Clip.1",
    ]);
    expect(durationOf(children[1])).toBe(5);
  });

  it("O4/H1: a clip that does not start at 0 gets a leading Gap.1", () => {
    const timeline: Timeline = {
      projectRate: 24,
      tracks: [
        {
          id: "v1",
          kind: "video",
          clips: [
            {
              id: "A",
              mediaRefId: "m1",
              sourceRange: {
                start: { value: 0, rate: 24 },
                duration: { value: 6, rate: 24 },
              },
              timelineRange: {
                start: { value: 12, rate: 24 },
                duration: { value: 6, rate: 24 },
              },
              properties: {},
              lineage: {
                rootId: "A",
                span: {
                  start: { value: 0, rate: 24 },
                  duration: { value: 6, rate: 24 },
                },
              },
            },
          ],
        },
      ],
      mediaRefs: [
        {
          id: "m1",
          kind: "video",
          url: "file://a.mov",
          hash: "",
          sourceRate: 24,
          durationInSource: { value: 100, rate: 24 },
        },
      ],
    };
    const children = exportedChildren(exportOtio(timeline), 0);
    expect(children.map((c) => c.OTIO_SCHEMA)).toEqual(["Gap.1", "Clip.1"]);
    expect(durationOf(children[0])).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// H2 — O4: a transition consumes no track time
// ---------------------------------------------------------------------------

describe("O4/H2: transition does not move the cursor", () => {
  const doc = otioTimeline({
    tracks: [
      otioTrack({
        kind: "Video",
        children: [
          otioClip({
            sourceStart: 0,
            duration: 10,
            rate: 24,
            targetUrl: "file://a.mov",
            available: { start: 0, duration: 100, rate: 24 },
          }),
          otioTransition(),
          otioClip({
            sourceStart: 0,
            duration: 8,
            rate: 24,
            targetUrl: "file://b.mov",
            available: { start: 0, duration: 100, rate: 24 },
          }),
        ],
      }),
    ],
  });

  it("O4/H2: the clip after a Transition.1 keeps its position exactly", () => {
    const { timeline, warnings } = expectImported(importOtio(doc));
    const clips = clipsOf(timeline, 0);
    expect(clips.length).toBe(2);
    expect(clips[0].timelineRange.start.value).toBe(0);
    // 10, not 14: the transition's 2+2 frames overlap its neighbours, they
    // do not occupy track time.
    expect(clips[1].timelineRange.start.value).toBe(10);
    expect(codes(warnings)).toEqual(["skipped-unsupported"]);
  });

  // Regression (2026-08-05 review, F1): real serializers write
  // `"source_range": null` on an untrimmed Item. That is "no range of its
  // own", not "a range that failed to parse" — treating it as present made
  // the whole import abort on exactly the nested Stack O7(b) says to skip.
  it("O4/H2: a skipped item with source_range null is skipped, not fatal", () => {
    const withNullRange = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 24,
              targetUrl: "file://a.mov",
              available: { start: 0, duration: 100, rate: 24 },
            }),
            {
              OTIO_SCHEMA: "Stack.1",
              name: "compound",
              source_range: null,
              children: [],
              effects: [],
              markers: [],
              metadata: {},
            },
            otioClip({
              sourceStart: 0,
              duration: 8,
              rate: 24,
              targetUrl: "file://b.mov",
              available: { start: 0, duration: 100, rate: 24 },
            }),
          ],
        }),
      ],
    });

    const { timeline, warnings } = expectImported(importOtio(withNullRange));
    const clips = clipsOf(timeline, 0);
    expect(clips.length).toBe(2);
    // No range of its own => nothing to advance by, same as a Transition.
    expect(clips[1].timelineRange.start.value).toBe(10);
    expect(codes(warnings)).toEqual(["skipped-unsupported"]);
  });
});

// ---------------------------------------------------------------------------
// H3 — O1 + O9: an image has no length, so it can be extended freely
// ---------------------------------------------------------------------------

describe("O1+O9/H3: image media", () => {
  const doc = otioTimeline({
    tracks: [
      otioTrack({
        kind: "Video",
        children: [
          otioClip({
            sourceStart: 0,
            duration: 5,
            rate: 24,
            targetUrl: "file://logo.PNG",
            available: null,
          }),
        ],
      }),
    ],
  });

  it("O9/H3: a .png target_url becomes kind 'image' (case-insensitive)", () => {
    const { timeline, warnings } = expectImported(importOtio(doc));
    const clip = clipsOf(timeline, 0)[0] as Clip;
    expect(mediaOf(timeline, clip).kind).toBe("image");
    // No skipped-media-length-missing: an image is not missing a length,
    // it has none (O1 vs O2).
    expect(warnings).toEqual([]);
  });

  it("O1/H3: image durationInSource is null and trim-extend succeeds", () => {
    const { timeline } = expectImported(importOtio(doc));
    const clip = clipsOf(timeline, 0)[0] as Clip;
    expect(mediaOf(timeline, clip).durationInSource).toBeNull();

    const extended = applyCommand(timeline, {
      op: "trim",
      clipId: clip.id,
      edge: "end",
      delta: { value: 1_000, rate: 24 },
    });
    expect(extended.ok).toBe(true);
    if (extended.ok && !extended.noChange) {
      const after = clipsOf(extended.timeline, 0)[0];
      expect(after.timelineRange.duration.value).toBe(1_005);
    }
  });
});

// ---------------------------------------------------------------------------
// H4 — O3: slip is not applicable to an image
// ---------------------------------------------------------------------------

describe("O3/H4: slip on an image clip", () => {
  it("O3/H4: image slip → E_NOT_APPLICABLE (parallel to the TextClip case)", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 5,
              rate: 24,
              targetUrl: "file://logo.png",
              available: null,
            }),
          ],
        }),
      ],
    });
    const { timeline } = expectImported(importOtio(doc));
    const clip = clipsOf(timeline, 0)[0];
    const result = applyCommand(timeline, {
      op: "slip",
      clipId: clip.id,
      delta: { value: 2, rate: 24 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("E_NOT_APPLICABLE");
  });
});

// ---------------------------------------------------------------------------
// H5 — O2: video/audio without available_range is not importable
// ---------------------------------------------------------------------------

describe("O2/H5: video without available_range", () => {
  it("O2/H5: the clip is skipped + warned, the rest of the file imports", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 24,
              targetUrl: "file://unknown-length.mov",
              available: null,
            }),
            otioClip({
              sourceStart: 3,
              duration: 8,
              rate: 24,
              targetUrl: "file://good.mov",
              available: { start: 0, duration: 100, rate: 24 },
            }),
          ],
        }),
      ],
    });

    const { timeline, warnings } = expectImported(importOtio(doc));
    const clips = clipsOf(timeline, 0);
    expect(clips.length).toBe(1);
    // The skipped clip still occupied its 10 frames in the OTIO file, so the
    // survivor must NOT slide left.
    expect(clips[0].timelineRange.start.value).toBe(10);
    expect(codes(warnings)).toEqual(["skipped-media-length-missing"]);
    // No MediaRef is invented for a file we could not use.
    expect(timeline.mediaRefs.map((m) => m.url)).toEqual(["file://good.mov"]);
  });
});

// ---------------------------------------------------------------------------
// A2.1 amendment (2026-08-05 review, F2) — media whose own range does not
// start at 0 (embedded timecode). Engine coordinates always start at 0, so
// the door subtracts the file's start and puts it back on export.
// ---------------------------------------------------------------------------

describe("A2.1/H5: available_range with a non-zero start", () => {
  const withOffset = (sourceStart: number) =>
    otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart,
              duration: 20,
              rate: 24,
              targetUrl: "file://tc.mov",
              // the file holds frames 90..289
              available: { start: 90, duration: 200, rate: 24 },
            }),
          ],
        }),
      ],
    });

  it("A2.1/H5: a window inside [90,290) imports, normalized to 0-based", () => {
    const { timeline, warnings } = expectImported(importOtio(withOffset(250)));
    expect(warnings).toEqual([]);
    const clip = clipsOf(timeline, 0)[0] as Clip;
    // 250 - 90 = 160, and the file is 200 long, so this is comfortably inside
    // — the old code read it as 250 inside a 200-long file and aborted.
    expect(clip.sourceRange.start.value).toBe(160);
    expect(clip.sourceRange.duration.value).toBe(20);
    const media = timeline.mediaRefs[0];
    expect(media.durationInSource?.value).toBe(200);
    expect(media.sourceStartInFile?.value).toBe(90);
  });

  it("A2.1/H5: a window the file does not contain is refused", () => {
    // frame 5 does not exist in a file that starts at 90; this used to import
    // silently because the start was dropped.
    const result = importOtio(withOffset(5));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("E_INVALID_OTIO");
  });

  it("A2.1/H5: export puts the file's own start back", () => {
    const { timeline } = expectImported(importOtio(withOffset(250)));
    const out = exportOtio(timeline) as Json;
    const clip = (
      (((out.tracks as Json).children as Json[])[0] as Json).children as Json[]
    )[0] as Json;
    const range = clip.source_range as Json;
    expect((range.start_time as Json).value).toBe(250);
    const available = (clip.media_reference as Json).available_range as Json;
    expect((available.start_time as Json).value).toBe(90);
    expect((available.duration as Json).value).toBe(200);
  });

  it("A3.6/H5: a property the media kind cannot carry skips the clip", () => {
    // N1 matrix: an image has no volume (a photo makes no sound). Importing
    // one would mint a state no verb can produce — applyCommand would answer
    // E_PROPERTY_NOT_APPLICABLE — while diff/merge kept comparing it.
    // [F3, 2026-08-05 review.]
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            {
              ...(otioClip({
                sourceStart: 0,
                duration: 5,
                rate: 24,
                targetUrl: "file://logo.png",
              }) as Json),
              metadata: { framebranch: { properties: { volume: 50 } } },
            },
          ],
        }),
      ],
    });

    const { timeline, warnings } = expectImported(importOtio(doc));
    expect(clipsOf(timeline, 0).length).toBe(0);
    expect(codes(warnings)).toEqual(["skipped-unknown-clip"]);
  });

  it("A3.6/H5: image media on an audio track is skipped, not coerced", () => {
    // N1 track mapping: an image is visual, so it belongs on a video lane.
    // addClip refuses this placement outright (E_TRACK_KIND_MISMATCH); import
    // used to accept it silently. [F4, 2026-08-05 review.]
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Audio",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 5,
              rate: 24,
              targetUrl: "file://cover.png",
            }),
          ],
        }),
      ],
    });

    const { timeline, warnings } = expectImported(importOtio(doc));
    expect(clipsOf(timeline, 0).length).toBe(0);
    expect(timeline.mediaRefs).toEqual([]);
    expect(codes(warnings)).toEqual(["skipped-unknown-clip"]);
  });

  it("O6/H7: the project rate ignores clips inside a skipped nested Stack", () => {
    // The rate must come from content we KEEP. A nested Stack is skipped
    // (O7b), so its 30fps clip must not decide the rate that the surviving
    // 24fps track then gets converted into. [F6, 2026-08-05 review.]
    const doc = otioTimeline({
      tracks: [
        {
          OTIO_SCHEMA: "Stack.1",
          name: "compound",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 30,
              targetUrl: "file://inner.mov",
              available: { start: 0, duration: 100, rate: 30 },
            }),
          ],
          effects: [],
          markers: [],
          metadata: {},
        },
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 24,
              targetUrl: "file://kept.mov",
              available: { start: 0, duration: 100, rate: 24 },
            }),
          ],
        }),
      ],
    });

    const { timeline } = expectImported(importOtio(doc));
    expect(timeline.projectRate).toBe(24);
    const clip = clipsOf(timeline, 0)[0] as Clip;
    expect(clip.sourceRange.duration.value).toBe(10);
  });

  it("A2.1/H5: round-trip keeps the offset media identical", () => {
    const { timeline: before } = expectImported(importOtio(withOffset(250)));
    const { timeline: after } = expectImported(importOtio(exportOtio(before)));
    expect(clipsOf(after, 0)[0].timelineRange).toEqual(
      clipsOf(before, 0)[0].timelineRange,
    );
    expect((clipsOf(after, 0)[0] as Clip).sourceRange).toEqual(
      (clipsOf(before, 0)[0] as Clip).sourceRange,
    );
    expect(after.mediaRefs[0].sourceStartInFile).toEqual(
      before.mediaRefs[0].sourceStartInFile,
    );
  });
});

// ---------------------------------------------------------------------------
// H6 — O5: text clips round-trip through metadata.framebranch
// ---------------------------------------------------------------------------

describe("O5/H6: text clip round-trip", () => {
  const style: TextStyle = { font: "Georgia", size: 32, color: "#00ff00" };
  const textTimeline = (): Timeline => ({
    projectRate: 24,
    tracks: [
      {
        id: "x1",
        kind: "text",
        clips: [
          {
            id: "TX",
            timelineRange: {
              start: { value: 4, rate: 24 },
              duration: { value: 6, rate: 24 },
            },
            textContent: "Welcome",
            textStyle: style,
            lineage: {
              rootId: "TX",
              span: {
                start: { value: 0, rate: 24 },
                duration: { value: 6, rate: 24 },
              },
            },
          },
        ] as TextClip[],
      },
    ],
    mediaRefs: [],
  });

  it("O5/H6: export writes MissingReference.1 + metadata.framebranch", () => {
    const doc = exportOtio(textTimeline());
    const track = exportedTrack(doc, 0);
    // OTIO has no text track kind: it goes out as Video + our metadata.
    expect(track.kind).toBe("Video");
    expect(obj(track.metadata, "track.metadata")).toEqual({
      framebranch: { kind: "text" },
    });

    const children = exportedChildren(doc, 0);
    expect(children.map((c) => c.OTIO_SCHEMA)).toEqual(["Gap.1", "Clip.1"]);
    const clip = children[1];
    expect(obj(clip.media_reference, "media_reference").OTIO_SCHEMA).toBe(
      "MissingReference.1",
    );
    const framebranch = obj(
      obj(clip.metadata, "clip.metadata").framebranch,
      "framebranch",
    );
    expect(framebranch.kind).toBe("text");
    expect(framebranch.textContent).toBe("Welcome");
    expect(framebranch.textStyle).toEqual(style);
  });

  it("O5/H6: re-import restores the TextClip and the text track kind", () => {
    const result = importOtio(exportOtio(textTimeline()));
    const { timeline } = expectImported(result);
    expect(timeline.tracks[0].kind).toBe("text");
    const clip = clipsOf(timeline, 0)[0] as TextClip;
    expect(clip.textContent).toBe("Welcome");
    expect(clip.textStyle).toEqual(style);
    expect(clip.timelineRange).toEqual({
      start: { value: 4, rate: 24 },
      duration: { value: 6, rate: 24 },
    });
  });

  it("O5/H6: a hand-written framebranch text track imports as TextClip", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          framebranchText: true,
          children: [
            otioGap(4, 24),
            otioTextClip({
              duration: 6,
              rate: 24,
              textContent: "Welcome",
              textStyle: style,
            }),
            // BC.5 — a missing style materializes the defaults.
            otioTextClip({ duration: 3, rate: 24, textContent: "Bye" }),
          ],
        }),
      ],
    });
    const { timeline, warnings } = expectImported(importOtio(doc));
    expect(timeline.tracks[0].kind).toBe("text");
    const clips = clipsOf(timeline, 0) as TextClip[];
    expect(clips.map((c) => c.textContent)).toEqual(["Welcome", "Bye"]);
    expect(clips[0].textStyle).toEqual(style);
    expect(clips[1].textStyle).toEqual({
      font: "Arial",
      size: 48,
      color: "#ffffff",
    });
    expect(clips[0].timelineRange.start.value).toBe(4);
    expect(clips[1].timelineRange.start.value).toBe(10);
    expect(warnings).toEqual([]);
  });

  it("O5/H6: a text clip with unusable payload is skipped + warned", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          framebranchText: true,
          children: [
            otioTextClip({ duration: 5, rate: 24, textContent: "" }),
            otioTextClip({
              duration: 5,
              rate: 24,
              textContent: "styled wrong",
              textStyle: { font: "Comic Sans" },
            }),
            otioTextClip({ duration: 5, rate: 24, textContent: "fine" }),
          ],
        }),
      ],
    });
    const { timeline, warnings } = expectImported(importOtio(doc));
    const clips = clipsOf(timeline, 0) as TextClip[];
    expect(clips.map((c) => c.textContent)).toEqual(["fine"]);
    // The two skipped clips still occupied 5 frames each.
    expect(clips[0].timelineRange.start.value).toBe(10);
    expect(codes(warnings)).toEqual([
      "skipped-unknown-clip",
      "skipped-unknown-clip",
    ]);
  });

  it("O5/H6: a MissingReference with no framebranch metadata is skipped", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            {
              OTIO_SCHEMA: "Clip.1",
              name: "someone else's placeholder",
              source_range: {
                OTIO_SCHEMA: "TimeRange.1",
                start_time: {
                  OTIO_SCHEMA: "RationalTime.1",
                  rate: 24,
                  value: 0,
                },
                duration: {
                  OTIO_SCHEMA: "RationalTime.1",
                  rate: 24,
                  value: 5,
                },
              },
              media_reference: {
                OTIO_SCHEMA: "MissingReference.1",
                name: "",
                available_range: null,
                metadata: {},
              },
              metadata: {},
            },
          ],
        }),
      ],
    });
    const { timeline, warnings } = expectImported(importOtio(doc));
    expect(clipsOf(timeline, 0).length).toBe(0);
    expect(codes(warnings)).toEqual(["skipped-unknown-clip"]);
  });
});

// ---------------------------------------------------------------------------
// H7 — O6: the three project-rate rules
// ---------------------------------------------------------------------------

describe("O6/H7: project rate", () => {
  it("O6/H7a: mixed rates converge on the first clip's rate", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 240,
              rate: 24,
              targetUrl: "file://a.mov",
              available: { start: 0, duration: 1_000, rate: 24 },
            }),
            otioClip({
              sourceStart: 0,
              duration: 300,
              rate: 30,
              targetUrl: "file://b.mov",
              available: { start: 0, duration: 1_000, rate: 30 },
            }),
          ],
        }),
      ],
    });
    const { timeline } = expectImported(importOtio(doc));
    expect(timeline.projectRate).toBe(24);
    const clips = clipsOf(timeline, 0) as Clip[];
    // 300 @30 = 10s = 240 @24 (A1.3 round-nearest, ties floor).
    expect(clips[1].timelineRange).toEqual({
      start: { value: 240, rate: 24 },
      duration: { value: 240, rate: 24 },
    });
    expect(mediaOf(timeline, clips[1]).durationInSource).toEqual({
      value: 800,
      rate: 24,
    });
  });

  it("O6/H7b: empty file, no global_start_time → 24 + warning, SUCCESS", () => {
    const { timeline, warnings } = expectImported(
      importOtio(otioTimeline({ tracks: [] })),
    );
    expect(timeline.projectRate).toBe(24);
    expect(timeline.tracks).toEqual([]);
    expect(codes(warnings)).toEqual(["rate-fallback-empty-timeline"]);
  });

  it("O6/H7c: global_start_time gives the rate; its value is ignored", () => {
    const doc = otioTimeline({
      globalStart: { value: 86_400, rate: 30 },
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 240,
              rate: 24,
              targetUrl: "file://a.mov",
              available: { start: 0, duration: 1_000, rate: 24 },
            }),
          ],
        }),
      ],
    });
    const { timeline } = expectImported(importOtio(doc));
    expect(timeline.projectRate).toBe(30);
    // Our timelines always start at 0 — 01:00:00:00 never travels with us.
    expect(clipsOf(timeline, 0)[0].timelineRange).toEqual({
      start: { value: 0, rate: 30 },
      duration: { value: 300, rate: 30 },
    });
  });
});

// ---------------------------------------------------------------------------
// H8 — O7: version whitelist
// ---------------------------------------------------------------------------

describe("O7/H8: schema version whitelist", () => {
  it("O7/H8: Clip.2 aborts the whole import, naming the label", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 24,
              targetUrl: "file://a.mov",
              available: { start: 0, duration: 100, rate: 24 },
              schema: "Clip.2",
            }),
          ],
        }),
      ],
    });
    const result = importOtio(doc);
    expectImportError(result, "E_UNSUPPORTED_OTIO_VERSION");
    if (!result.ok) expect(result.error.message).toContain("Clip.2");
  });

  it("O7/H8: Track.5 aborts too (a structural schema, not an extra item)", () => {
    const doc = otioTimeline({
      tracks: [otioTrack({ kind: "Video", children: [], schema: "Track.5" })],
    });
    const result = importOtio(doc);
    expectImportError(result, "E_UNSUPPORTED_OTIO_VERSION");
    if (!result.ok) expect(result.error.message).toContain("Track.5");
  });

  it("O7/H8: a document using all nine whitelisted labels imports", () => {
    const { timeline, warnings } = expectImported(
      importOtio(ALL_WHITELIST_LABELS_DOC as Json),
    );
    expect(timeline.projectRate).toBe(24);
    expect(timeline.tracks.map((t: Track) => t.kind)).toEqual([
      "video",
      "text",
    ]);
    expect(clipsOf(timeline, 0).length).toBe(1);
    expect((clipsOf(timeline, 1)[0] as TextClip).textContent).toBe("Hello");
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H9 — O8: warning shape
// ---------------------------------------------------------------------------

describe("O8/H9: warning shape", () => {
  it("O8/H9: warnings are {code, detail, count}, grouped and counted", () => {
    const doc = otioTimeline({
      tracks: [
        otioTrack({
          kind: "Video",
          children: [
            otioClip({
              sourceStart: 0,
              duration: 10,
              rate: 24,
              targetUrl: "file://a.mov",
              available: { start: 0, duration: 100, rate: 24 },
            }),
            otioTransition(),
            otioClip({
              sourceStart: 0,
              duration: 5,
              rate: 24,
              targetUrl: "file://no-length.mov",
              available: null,
            }),
            otioTransition(),
          ],
        }),
      ],
    });
    const { warnings } = expectImported(importOtio(doc));

    // Two transitions = ONE entry with count 2, not two entries.
    expect(warnings.length).toBe(2);
    for (const warning of warnings) {
      expect(Object.keys(warning).sort()).toEqual(["code", "count", "detail"]);
      expect(typeof warning.detail).toBe("string");
      expect(typeof warning.count).toBe("number");
    }
    // Assertions are on CODE only — never on the English prose.
    expect(codes(warnings).sort()).toEqual([
      "skipped-media-length-missing",
      "skipped-unsupported",
    ]);
    const transitions = warnings.find((w) => w.code === "skipped-unsupported");
    expect(transitions?.count).toBe(2);
    expect(
      warnings.find((w) => w.code === "skipped-media-length-missing")?.count,
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// H10 — O10: full round-trip on a fixture with gap + text + image
// ---------------------------------------------------------------------------

/** B3.1 — defaults materialize before comparing. */
const materialize = (properties: Record<string, unknown> | undefined) => ({
  volume: properties?.volume ?? 100,
  opacity: properties?.opacity ?? 100,
  scale: properties?.scale ?? 1,
  position: properties?.position ?? { x: 0, y: 0 },
});

/**
 * O10 — the exact comparison: track order + kind, every clip's
 * timelineRange / sourceRange, the media a clip sits on matched by URL
 * (never by id — import always mints fresh ids), text content + style,
 * properties with defaults materialized, and projectRate.
 */
function structure(timeline: Timeline): unknown {
  return {
    projectRate: timeline.projectRate,
    tracks: timeline.tracks.map((track) => ({
      kind: track.kind,
      clips: [...(track.clips as AnyClip[])]
        .sort(
          (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
        )
        .map((clip) =>
          "textContent" in clip
            ? {
                type: "text",
                timelineRange: clip.timelineRange,
                textContent: clip.textContent,
                textStyle: clip.textStyle,
                opacity: clip.properties?.opacity ?? 100,
                position: clip.properties?.position ?? { x: 0, y: 0 },
              }
            : {
                type: "media",
                timelineRange: clip.timelineRange,
                sourceRange: clip.sourceRange,
                mediaUrl: mediaOf(timeline, clip).url,
                mediaKind: mediaOf(timeline, clip).kind,
                mediaLength: mediaOf(timeline, clip).durationInSource,
                properties: materialize(clip.properties),
              },
        ),
    })),
  };
}

function roundTripFixture(): Timeline {
  const video: Track = {
    id: "v1",
    kind: "video",
    clips: [
      // gap 0-4, clip 4-14, gap 14-20, image 20-25
      {
        id: "A",
        mediaRefId: "mV",
        sourceRange: {
          start: { value: 5, rate: 24 },
          duration: { value: 10, rate: 24 },
        },
        timelineRange: {
          start: { value: 4, rate: 24 },
          duration: { value: 10, rate: 24 },
        },
        // O10 — non-default properties on purpose: they are what proves the
        // round-trip carries them (they have no OTIO field of their own).
        properties: { volume: 80, scale: 1.5 },
        lineage: {
          rootId: "A",
          span: {
            start: { value: 0, rate: 24 },
            duration: { value: 10, rate: 24 },
          },
        },
      },
      {
        id: "IM",
        mediaRefId: "mI",
        sourceRange: {
          start: { value: 0, rate: 24 },
          duration: { value: 5, rate: 24 },
        },
        timelineRange: {
          start: { value: 20, rate: 24 },
          duration: { value: 5, rate: 24 },
        },
        // opacity/position are the image column of the N1 matrix (volume and
        // scale are not — an image has no volume).
        properties: { opacity: 40, position: { x: 12, y: -3 } },
        lineage: {
          rootId: "IM",
          span: {
            start: { value: 0, rate: 24 },
            duration: { value: 5, rate: 24 },
          },
        },
      },
    ],
  };
  const audio: Track = {
    id: "a1",
    kind: "audio",
    clips: [
      {
        id: "AU",
        mediaRefId: "mA",
        sourceRange: {
          start: { value: 0, rate: 24 },
          duration: { value: 8, rate: 24 },
        },
        timelineRange: {
          start: { value: 0, rate: 24 },
          duration: { value: 8, rate: 24 },
        },
        properties: {},
        lineage: {
          rootId: "AU",
          span: {
            start: { value: 0, rate: 24 },
            duration: { value: 8, rate: 24 },
          },
        },
      },
    ],
  };
  const text: Track = {
    id: "x1",
    kind: "text",
    clips: [
      {
        id: "TX",
        timelineRange: {
          start: { value: 6, rate: 24 },
          duration: { value: 9, rate: 24 },
        },
        textContent: "Round trip",
        textStyle: { font: "Courier New", size: 30, color: "#ff00ff" },
        lineage: {
          rootId: "TX",
          span: {
            start: { value: 0, rate: 24 },
            duration: { value: 9, rate: 24 },
          },
        },
      },
    ],
  };
  return {
    projectRate: 24,
    tracks: [video, audio, text],
    mediaRefs: [
      {
        id: "mV",
        kind: "video",
        url: "file://v.mp4",
        hash: "",
        sourceRate: 24,
        durationInSource: { value: 500, rate: 24 },
      },
      {
        id: "mA",
        kind: "audio",
        url: "file://a.wav",
        hash: "",
        sourceRate: 24,
        durationInSource: { value: 400, rate: 24 },
      },
      {
        id: "mI",
        kind: "image",
        url: "file://logo.png",
        hash: "",
        sourceRate: 24,
        durationInSource: null, // O1
      },
    ],
  };
}

describe("O10/H10: round-trip (gap + text + image)", () => {
  it("O10/H10: the fixture really contains a gap, a text clip and an image", () => {
    // The fixture requirement is itself a lock — without these three the
    // round-trip would pass while testing none of the new behaviour.
    const timeline = roundTripFixture();
    expect(clipsOf(timeline, 0)[0].timelineRange.start.value).toBeGreaterThan(
      0,
    ); // leading gap
    expect(timeline.tracks.some((t) => t.kind === "text")).toBe(true);
    expect(timeline.mediaRefs.some((m) => m.kind === "image")).toBe(true);
    expect(
      timeline.mediaRefs.find((m) => m.kind === "image")?.durationInSource,
    ).toBeNull();
    // …and non-default properties, so the round-trip below cannot go green
    // while silently dropping them (they have no OTIO field of their own).
    expect(clipsOf(timeline, 0)[0].properties).toEqual({
      volume: 80,
      scale: 1.5,
    });
    expect(clipsOf(timeline, 0)[1].properties).toEqual({
      opacity: 40,
      position: { x: 12, y: -3 },
    });
  });

  it("O10/H10: timeline → exportOtio → importOtio → structurally equal", () => {
    const before = roundTripFixture();
    const { timeline: after, warnings } = expectImported(
      importOtio(exportOtio(before)),
    );
    expect(warnings).toEqual([]);
    expect(structure(after)).toEqual(structure(before));
    // Fresh start: the ids are genuinely new (docs/09 #10).
    expect(clipsOf(after, 0)[0].id).not.toBe("A");
  });
});

// ---------------------------------------------------------------------------
// H11 — invalid input
// ---------------------------------------------------------------------------

describe("H11: invalid OTIO input", () => {
  const garbage: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "not otio"],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
    ["a non-Timeline schema", { OTIO_SCHEMA: "Marker.1" }],
    ["a Timeline with no tracks", { OTIO_SCHEMA: "Timeline.1", name: "x" }],
    [
      "a Timeline whose tracks are not a Stack",
      { OTIO_SCHEMA: "Timeline.1", tracks: { OTIO_SCHEMA: "Track.1" } },
    ],
    [
      "a clip with a broken source_range",
      otioTimeline({
        tracks: [
          otioTrack({
            kind: "Video",
            children: [
              {
                OTIO_SCHEMA: "Clip.1",
                name: "",
                source_range: { start_time: 3, duration: 4 },
                media_reference: {
                  OTIO_SCHEMA: "ExternalReference.1",
                  target_url: "file://a.mov",
                  available_range: null,
                  metadata: {},
                },
                metadata: {},
              },
            ],
          }),
        ],
      }),
    ],
    [
      "a non-integer frame value",
      otioTimeline({
        tracks: [
          otioTrack({
            kind: "Video",
            children: [
              {
                OTIO_SCHEMA: "Clip.1",
                name: "",
                source_range: {
                  OTIO_SCHEMA: "TimeRange.1",
                  start_time: {
                    OTIO_SCHEMA: "RationalTime.1",
                    rate: 24,
                    value: 0,
                  },
                  duration: {
                    OTIO_SCHEMA: "RationalTime.1",
                    rate: 23.976,
                    value: 10,
                  },
                },
                media_reference: {
                  OTIO_SCHEMA: "ExternalReference.1",
                  target_url: "file://a.mov",
                  available_range: null,
                  metadata: {},
                },
                metadata: {},
              },
            ],
          }),
        ],
      }),
    ],
  ];

  for (const [label, input] of garbage) {
    it(`H11: ${label} → E_INVALID_OTIO`, () => {
      expectImportError(importOtio(input), "E_INVALID_OTIO");
    });
  }

  it("H11: import never throws, whatever it is handed", () => {
    const nasty: unknown[] = [
      Symbol("x"),
      () => 0,
      new Map(),
      { OTIO_SCHEMA: "Timeline.1", tracks: { OTIO_SCHEMA: "Stack.1" } },
    ];
    for (const input of nasty) {
      expect(() => importOtio(input)).not.toThrow();
    }
  });
});
