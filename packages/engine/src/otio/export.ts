import type { RationalTime, TextClip, Timeline, TimeRange, Track } from "../types";
import type { OtioJson } from "./types";
import { type AnyClip, rangeEnd, rt } from "./shared-parsers";

const rationalTimeJson = (t: RationalTime): OtioJson => ({
  OTIO_SCHEMA: "RationalTime.1",
  rate: t.rate,
  value: t.value,
});

const timeRangeJson = (r: TimeRange): OtioJson => ({
  OTIO_SCHEMA: "TimeRange.1",
  start_time: rationalTimeJson(r.start),
  duration: rationalTimeJson(r.duration),
});

/** — every empty stretch becomes a real `Gap.1` item ("Filler"). */
const gapJson = (duration: number, rate: number): OtioJson => ({
  OTIO_SCHEMA: "Gap.1",
  name: "Filler",
  source_range: timeRangeJson({
    start: rt(0, rate),
    duration: rt(duration, rate),
  }),
  effects: [],
  markers: [],
  metadata: {},
});

const isTextClip = (c: AnyClip): c is TextClip => "textContent" in c;

/**
 * exportOtio — our timeline → an OTIO document. Never fails, never writes
 * internal IDs ( #11); the only thing we add to the format is the
 * locked `metadata.framebranch` extension .
 */
export function exportOtio(timeline: Timeline): OtioJson {
  const rate = timeline.projectRate;
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: "",
    // round-trips the project rate exactly, including for an empty
    // timeline. The VALUE is always 0: our timelines start at 0.
    global_start_time: rationalTimeJson(rt(0, rate)),
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: timeline.tracks.map((track) => exportTrack(track, timeline)),
      markers: [],
      effects: [],
      metadata: {},
    },
    metadata: {},
  };
}

function exportTrack(track: Track, timeline: Timeline): OtioJson {
  const rate = timeline.projectRate;
  const clips = [...(track.clips as readonly AnyClip[])].sort(
    (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
  );

  const children: OtioJson[] = [];
  let cursor = 0;
  for (const clip of clips) {
    const start = clip.timelineRange.start.value;
    // leading gap + every gap between clips; omitting them would
    // silently slide every later clip (OTIO positions are implicit).
    if (start > cursor) children.push(gapJson(start - cursor, rate));
    children.push(exportClip(clip, timeline));
    cursor = Math.max(cursor, rangeEnd(clip.timelineRange));
  }

  // OTIO has no text track kind: it goes out as Video + our metadata.
  const metadata: OtioJson =
    track.kind === "text" ? { framebranch: { kind: "text" } } : {};

  return {
    OTIO_SCHEMA: "Track.1",
    name: "",
    kind: track.kind === "audio" ? "Audio" : "Video",
    children,
    markers: [],
    effects: [],
    metadata,
  };
}

function exportClip(clip: AnyClip, timeline: Timeline): OtioJson {
  if (isTextClip(clip)) {
    // text clip = Clip.1 + MissingReference.1 + framebranch metadata.
    return {
      OTIO_SCHEMA: "Clip.1",
      name: "",
      source_range: timeRangeJson({
        start: rt(0, clip.timelineRange.duration.rate),
        duration: clip.timelineRange.duration,
      }),
      media_reference: {
        OTIO_SCHEMA: "MissingReference.1",
        name: "",
        available_range: null,
        metadata: {},
      },
      effects: [],
      markers: [],
      metadata: {
        framebranch: {
          kind: "text",
          textContent: clip.textContent,
          textStyle: { ...clip.textStyle },
          ...propertiesJson(clip.properties),
        },
      },
    };
  }

  const media = timeline.mediaRefs.find((m) => m.id === clip.mediaRefId);
  // amendment — put the file's own start back on, so a file with
  // embedded timecode comes out exactly as it went in.
  const fileStart = media?.sourceStartInFile;
  const outSourceRange: TimeRange = fileStart
    ? {
        start: rt(
          clip.sourceRange.start.value + fileStart.value,
          clip.sourceRange.start.rate,
        ),
        duration: clip.sourceRange.duration,
      }
    : clip.sourceRange;
  return {
    OTIO_SCHEMA: "Clip.1",
    name: "",
    source_range: timeRangeJson(outSourceRange),
    media_reference: media
      ? {
          OTIO_SCHEMA: "ExternalReference.1",
          target_url: media.url,
          // an image has no length, so it has no available_range.
          available_range:
            media.durationInSource === null
              ? null
              : timeRangeJson({
                  start: fileStart ?? rt(0, media.durationInSource.rate),
                  duration: media.durationInSource,
                }),
          metadata: {},
        }
      : // Export never fails (docs/09 #12/#13): a clip whose media ref is
        // gone still goes out, honestly, as a placeholder.
        {
          OTIO_SCHEMA: "MissingReference.1",
          name: "",
          available_range: null,
          metadata: {},
        },
    effects: [],
    markers: [],
    // / — properties ride in our own namespace; a clip sitting at the
    // defaults writes nothing at all, so plain files stay plain.
    metadata: emptyOrFramebranch(propertiesJson(clip.properties)),
  };
}

function propertiesJson(
  properties: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const entries = Object.entries(properties ?? {}).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return {};
  return { properties: Object.fromEntries(entries) };
}

function emptyOrFramebranch(payload: Record<string, unknown>): OtioJson {
  return Object.keys(payload).length === 0 ? {} : { framebranch: payload };
}
