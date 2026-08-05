/**
 * agent-scripts.ts — the SIMULATED agent (docs/11 C8).
 *
 * `POST agent/simulate` takes a script NAME, not a payload of commands: the
 * scripted edits are a server-side fixture. The evidence for "name" is C3's
 * branch template, which is literally `agent/<script>-N`, and C8, which
 * writes the edits out itself.
 *
 * The agent is not special. It uses the SAME eight verbs through the SAME
 * `applyCommand` the human path uses (docs/09 triage #3: "same verbs, same
 * provenance, different batching") — the only differences are that a whole
 * run is one request and every op carries `actor: "agent"` (that is what the
 * 🤖 badge reads).
 *
 * A script is a FUNCTION of the timeline, not a frozen list, because ids are
 * minted at import time: the fixture's clips are `clip-1`… only in a
 * freshly-seeded project, and the agent must work on whatever the branch
 * actually holds. It resolves its targets positionally — the same way the
 * choreography describes them ("A", "B", "the caption").
 */

import type {
  Clip,
  Command,
  MediaRef,
  TextClip,
  Timeline,
  Track,
} from "@framebranch/engine";

import { ApiError } from "./envelope";

/** `Track.clips` is `Clip[] | TextClip[]`; positional lookup needs neither. */
type AnyClip = Clip | TextClip;

export type AgentScript = {
  name: string;
  /** Build the run's commands against the branch's current timeline. */
  build: (timeline: Timeline) => Command[];
};

const trackOfKind = (timeline: Timeline, kind: Track["kind"]): Track => {
  const track = timeline.tracks.find((candidate) => candidate.kind === kind);
  if (!track) {
    throw new ApiError(
      "E_TRACK_NOT_FOUND",
      `the script needs a ${kind} track and this timeline has none`,
    );
  }
  return track;
};

/** Clips in the order an editor sees them: left to right. */
const byStart = (track: Track): AnyClip[] =>
  (track.clips as AnyClip[])
    .slice()
    .sort((a, b) => a.timelineRange.start.value - b.timelineRange.start.value);

const nth = (track: Track, index: number, label: string): AnyClip => {
  const clip = byStart(track)[index];
  if (!clip) {
    throw new ApiError(
      "E_CLIP_NOT_FOUND",
      `the script needs clip ${label} and this timeline has none at that position`,
    );
  }
  return clip;
};

const mediaByUrlSuffix = (timeline: Timeline, suffix: string): MediaRef => {
  const media = timeline.mediaRefs.find((ref) => ref.url.endsWith(suffix));
  if (!media) {
    throw new ApiError(
      "E_MEDIA_NOT_FOUND",
      `the script needs the media "${suffix}" and this timeline does not reference it`,
    );
  }
  return media;
};

const frames = (seconds: number, rate: number): number => seconds * rate;

/**
 * C8's locked agent script, run on branch `tighten-intro`:
 *   A.volume = 40          → collides with the user's A.volume = 80  (B1)
 *   caption DELETE         → collides with the user's caption edit   (B2)
 *   add clip D at 0:20     → collides with the user's C moved to 0:20 (B3)
 *   B end-trim             → composes cleanly (the friction-free half)
 *
 * D's command is written out verbatim in C8's F12 amendment: the b-roll
 * media (already in the fixture), source 0s + 5s, timeline 0:20 + 5s, on the
 * SAME video track the user moved C onto. BC.4 holds by construction
 * (source 5s === timeline 5s).
 *
 * The B end-trim's SIZE is the one number C8 does not fix; 2s is used (a
 * real shortening, small enough to stay inside the clip). Recorded in
 * IMPLEMENTATION-NOTES.md.
 */
const tightenIntro: AgentScript = {
  name: "tighten-intro",
  build: (timeline) => {
    const rate = timeline.projectRate;
    const video = trackOfKind(timeline, "video");
    const text = trackOfKind(timeline, "text");
    const clipA = nth(video, 0, "A");
    const clipB = nth(video, 1, "B");
    const caption = nth(text, 0, "the caption");
    const broll = mediaByUrlSuffix(timeline, "broll.mp4");

    return [
      {
        op: "propertyChange",
        clipId: clipA.id,
        property: "volume",
        value: 40,
      },
      { op: "deleteClip", clipId: caption.id },
      {
        op: "addClip",
        trackId: video.id,
        mediaRefId: broll.id,
        sourceRange: {
          start: { value: 0, rate },
          duration: { value: frames(5, rate), rate },
        },
        timelineRange: {
          start: { value: frames(20, rate), rate },
          duration: { value: frames(5, rate), rate },
        },
      },
      {
        op: "trim",
        clipId: clipB.id,
        edge: "end",
        delta: { value: -frames(2, rate), rate },
      },
    ];
  },
};

const SCRIPTS: Record<string, AgentScript> = {
  [tightenIntro.name]: tightenIntro,
};

/** An unknown script name is rejected at the door (E_BAD_REQUEST). */
export function agentScript(name: string): AgentScript {
  const script = SCRIPTS[name];
  if (!script) {
    throw new ApiError("E_BAD_REQUEST", `unknown agent script "${name}"`);
  }
  return script;
}

export const AGENT_SCRIPT_NAMES = Object.keys(SCRIPTS);
