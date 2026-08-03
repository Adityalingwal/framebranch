/**
 * Shared test fixtures (24fps — the demo fixture rate; the engine itself
 * is rate-agnostic, A1.3 clarification).
 *
 * Standard timeline:
 *   mediaRefs: mV video (100 frames), mA audio (200), mI image (1000)
 *   v1 (video): A  tl [10,20) src [5,15)  volume 80   ← BC.3 example clip
 *               B  tl [30,35) src [93,98) (near end of mV file)
 *               IM tl [50,55) src [0,5)   image clip
 *   a1 (audio): AU tl [0,8)   src [0,8)
 *   x1 (text):  TX  tl [0,4)  "Welcome"  (defaults style)
 *               TX2 tl [10,5) "Bye"
 */

import type {
  Clip,
  MediaRef,
  RationalTime,
  TextClip,
  Timeline,
  TimeRange,
  TextStyle,
  Track,
} from "../src/types";

export const R = 24;

export const t = (value: number, rate: number = R): RationalTime => ({
  value,
  rate,
});

export const range = (
  start: number,
  duration: number,
  rate: number = R,
): TimeRange => ({
  start: t(start, rate),
  duration: t(duration, rate),
});

export const DEFAULT_STYLE: TextStyle = {
  font: "Arial",
  size: 48,
  color: "#ffffff",
};

export function mediaClip(
  id: string,
  mediaRefId: string,
  srcStart: number,
  tlStart: number,
  duration: number,
  properties: Clip["properties"] = {},
): Clip {
  return {
    id,
    mediaRefId,
    sourceRange: range(srcStart, duration),
    timelineRange: range(tlStart, duration),
    properties,
    lineage: { rootId: id, span: range(0, duration) },
  };
}

export function textClip(
  id: string,
  tlStart: number,
  duration: number,
  textContent: string,
  textStyle: TextStyle = DEFAULT_STYLE,
): TextClip {
  return {
    id,
    timelineRange: range(tlStart, duration),
    textContent,
    textStyle,
    lineage: { rootId: id, span: range(0, duration) },
  };
}

export const MEDIA_REFS: MediaRef[] = [
  {
    id: "mV",
    kind: "video",
    url: "mem://v.mp4",
    hash: "hV",
    sourceRate: 24,
    durationInSource: t(100),
  },
  {
    id: "mA",
    kind: "audio",
    url: "mem://a.wav",
    hash: "hA",
    sourceRate: 24,
    durationInSource: t(200),
  },
  {
    id: "mI",
    kind: "image",
    url: "mem://i.png",
    hash: "hI",
    sourceRate: 24,
    durationInSource: t(1000),
  },
];

export function baseTimeline(): Timeline {
  const v1: Track = {
    id: "v1",
    kind: "video",
    clips: [
      mediaClip("A", "mV", 5, 10, 10, { volume: 80 }),
      mediaClip("B", "mV", 93, 30, 5),
      mediaClip("IM", "mI", 0, 50, 5),
    ],
  };
  const a1: Track = {
    id: "a1",
    kind: "audio",
    clips: [mediaClip("AU", "mA", 0, 0, 8)],
  };
  const x1: Track = {
    id: "x1",
    kind: "text",
    clips: [textClip("TX", 0, 4, "Welcome"), textClip("TX2", 10, 5, "Bye")],
  };
  return { projectRate: R, tracks: [v1, a1, x1], mediaRefs: MEDIA_REFS };
}

export const EMPTY_TIMELINE: Timeline = {
  projectRate: R,
  tracks: [],
  mediaRefs: [],
};
