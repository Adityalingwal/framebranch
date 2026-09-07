"use client";

import type { Timeline } from "@framebranch/engine";

import {
  clipDisplayName,
  findClipById,
  findMediaRef,
  isTextClip,
  type AnyClip,
} from "../../lib/clip-helpers";
import { formatFrames } from "../../lib/format";
import { PreviewPane } from "../PreviewPane";

/**
 * B2 §2.7 — the Compare player. D4(3): NOT a new player — the host's own
 * `PreviewPane`, which shows ONE clip. This wrapper only decides WHICH clip
 * (lock (4)) and puts the Before/After switch and the caption on the frame.
 *
 * Nothing plays on its own: `variant="compare"` also stops PreviewPane's
 * `loadedmetadata` auto-start, and the `key` below remounts the media
 * element whenever the side or the clip changes, so a switch always lands
 * on a paused frame.
 */

type Side = "before" | "after";

export function ComparePlayer({
  before,
  after,
  focus,
  playheadFrame,
  onSetPlayhead,
  onSideChange,
}: {
  before: Timeline;
  after: Timeline;
  focus: { side: Side; clipId: string | null } | null;
  playheadFrame: number;
  onSetPlayhead: (frame: number) => void;
  onSideChange: (side: Side) => void;
}) {
  // Default side when Compare opens (§2.7): After — the state you are in.
  const side: Side = focus?.side ?? "after";
  const timeline = side === "before" ? before : after;
  const rate = timeline.projectRate;

  // Lock (4): the focused clip on this side; if it does not exist here
  // (a removed clip after switching to After, say) fall back to whatever
  // sits under the playhead, and to a blank frame if nothing does.
  const focused = focus?.clipId
    ? (findClipById(timeline, focus.clipId) ?? null)
    : null;
  const clip = focused ?? clipUnderPlayhead(timeline, playheadFrame);
  const mediaRef =
    clip && !isTextClip(clip) ? findMediaRef(timeline, clip.mediaRefId) : undefined;

  return (
    <div className="compare-player">
      <PreviewPane
        // A new element per side/clip — a reused <video> could carry a
        // playing state across the switch.
        key={`${side}:${clip?.id ?? "none"}`}
        clip={clip}
        mediaRef={mediaRef}
        playheadFrame={playheadFrame}
        projectRate={rate}
        onSetPlayhead={onSetPlayhead}
        variant="compare"
      />
      {/* #127 — two segments on the frame; the time never moves, only which
          timeline the frame is read from. */}
      <div className="compare-ab" role="group" aria-label="Preview side">
        {(["before", "after"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={side === option ? "is-on" : ""}
            aria-pressed={side === option}
            onClick={() => onSideChange(option)}
          >
            {option === "before" ? "Before" : "After"}
          </button>
        ))}
      </div>
      {/* #128 — `‹clip› · ‹tc›`. No clip on this side → no caption at all. */}
      {clip && (
        <span className="compare-caption">
          {clipDisplayName(clip, mediaRef)} · {formatFrames(playheadFrame, rate)}
        </span>
      )}
    </div>
  );
}

/** The first video track's clip at this frame, else the first text track's. */
function clipUnderPlayhead(timeline: Timeline, frame: number): AnyClip | null {
  const firstOfKind = (kind: "video" | "text") =>
    timeline.tracks.find((track) => track.kind === kind);
  for (const track of [firstOfKind("video"), firstOfKind("text")]) {
    if (!track) continue;
    const found = (track.clips as AnyClip[]).find((clip) => {
      const start = clip.timelineRange.start.value;
      return frame >= start && frame < start + clip.timelineRange.duration.value;
    });
    if (found) return found;
  }
  return null;
}
