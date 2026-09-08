/**
 * agent-scripts.ts — the simulated agent's preset registry.
 *
 * I1: the Agent panel offers three PRESETS. Each is a fixed, server-side
 * script — no model, no live AI — and the panel's honesty line (#175) says
 * so. `POST /api/agent/run` takes a preset id, not a payload of commands.
 *
 * The agent uses the same eight verbs through the same applyCommand the
 * human path uses. Differences: a whole run is one request, every op
 * carries actor "agent" (the 🤖 badge), and the run happens on the preset's
 * OWN cut — `agent-‹id›`, never on main (I1 patch (a)).
 *
 * A script is a function of the timeline, not a frozen list, because clip
 * ids are minted at import time. It resolves targets POSITIONALLY — the way
 * the choreography describes them, and the reason every shipped preset
 * fixture has to satisfy the geometry in `presets.ts`.
 */

import type {
  Clip,
  Command,
  MediaRef,
  TextClip,
  Timeline,
  Track,
} from "@framebranch/engine";

import { clipDisplayName } from "../lib/clip-helpers";
import { ApiError } from "./envelope";

/** `Track.clips` is `Clip[] | TextClip[]`; positional lookup needs neither. */
type AnyClip = Clip | TextClip;

/** F2a — the agent is always shown as `Agent`, never a user's name. */
export const AGENT_ACTOR_NAME = "Agent";

export type AgentScript = {
  /** The preset id the API accepts; also the cut name's suffix (#186). */
  id: string;
  /** C1(3) / copy #176-#178 — the preset's name, and its card's name. */
  name: string;
  /** Copy #176-#178 — one line, the truth about what the script does. */
  description: string;
  /** Build the run's commands against the cut's current timeline. */
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

/** The name the editor sees on a clip — the same one the Compare rows use. */
const displayNameOf = (timeline: Timeline, clip: AnyClip): string =>
  clipDisplayName(
    clip,
    "mediaRefId" in clip
      ? timeline.mediaRefs.find((ref) => ref.id === clip.mediaRefId)
      : undefined,
  );

/**
 * C8's locked agent script, now run on the cut `agent-tighten-intro`:
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
 * real shortening, small enough to stay inside the clip).
 */
const tightenIntro: AgentScript = {
  id: "tighten-intro",
  name: "Tighten intro",
  description:
    "Trims the opening, dips a clip's volume and swaps the caption for B-roll.",
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

/**
 * B4a lock (2) — one second off each end of the first video clip.
 *
 * The engine's trim convention (`verbs/transform-clip.ts`): the delta is
 * applied as "minus = cut, plus = extend" on BOTH edges — `start` moves the
 * clip's start to `start - delta`, `end` changes the duration by `+delta`.
 * So "shorter by 1s at each end" is a NEGATIVE delta twice, not a signed
 * pair. The test asserts the resulting duration, not the sign.
 */
const trimSilences: AgentScript = {
  id: "trim-silences",
  name: "Trim silences",
  description: "Shortens the interview clip at both ends.",
  build: (timeline) => {
    const rate = timeline.projectRate;
    const video = trackOfKind(timeline, "video");
    const clipA = nth(video, 0, "A");
    return [
      {
        op: "trim",
        clipId: clipA.id,
        edge: "start",
        delta: { value: -frames(1, rate), rate },
      },
      {
        op: "trim",
        clipId: clipA.id,
        edge: "end",
        delta: { value: -frames(1, rate), rate },
      },
    ];
  },
};

/**
 * B4a lock (2) — a caption over the second and third video clips, each
 * carrying that clip's own display name.
 *
 * The text track has to be free over both ranges: the engine refuses an
 * overlapping addClip and the whole run then fails atomically, which is the
 * designed behaviour. On both shipped fixtures those ranges are empty.
 */
const addCaptions: AgentScript = {
  id: "add-captions",
  name: "Add captions",
  description: "Puts a text caption over the second and third video clips.",
  build: (timeline) => {
    const video = trackOfKind(timeline, "video");
    const text = trackOfKind(timeline, "text");
    return [1, 2].map((index) => {
      const clip = nth(video, index, `V1[${index}]`);
      return {
        op: "addClip",
        trackId: text.id,
        textContent: displayNameOf(timeline, clip),
        textStyle: { font: "Arial", size: 48, color: "#ffffff" },
        timelineRange: clip.timelineRange,
      } as Command;
    });
  },
};

const SCRIPTS: readonly AgentScript[] = [
  tightenIntro,
  trimSilences,
  addCaptions,
];

/** The public shape of the registry — what `GET /api/agent/presets` lists. */
export type AgentPresetInfo = {
  id: string;
  name: string;
  description: string;
};

export const AGENT_PRESETS: readonly AgentPresetInfo[] = SCRIPTS.map(
  ({ id, name, description }) => ({ id, name, description }),
);

/** An unknown preset id is rejected at the door (E_BAD_REQUEST). */
export function agentPreset(id: string): AgentScript {
  const script = SCRIPTS.find((candidate) => candidate.id === id);
  if (!script) {
    throw new ApiError("E_BAD_REQUEST", `unknown agent preset "${id}"`);
  }
  return script;
}

/**
 * Copy #186 — the cut a preset runs on. ONE function: the run route mints
 * it, the presets route looks the run state up by it, and the tests read it
 * rather than spelling the name out.
 */
export function agentCutName(id: string): string {
  return `agent-${id}`;
}
