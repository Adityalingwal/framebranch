import type { Timeline, Track } from "@framebranch/engine";

import type { AnyClip } from "../../lib/clip-helpers";
import { pxPerFrame, timelineEndFrame } from "./scale";
import { TimeRuler } from "./TimeRuler";
import { TrackRow } from "./TrackRow";

const LANE_LABEL_WIDTH = 96;

/**
 * §8.1 — DOM divs (M8 lock 3), tracks top to bottom, clips positioned by
 * `timelineRange` scaled by a fixed zoom factor. 10-30 clips is the design
 * size — no virtualization (locked).
 *
 * M8b adds: drag-to-edit on every clip (move/trim/slip — §5) and a
 * click-to-place playhead used by the Split action (§5: "a playhead/marker +
 * a Split action").
 */
export function TimelineView({
  timeline,
  selectedClipId,
  highlightedClipId,
  playheadFrame,
  onSelectClip,
  onSetPlayhead,
  onMove,
  onTrim,
  onSlip,
}: {
  timeline: Timeline;
  selectedClipId: string | null;
  highlightedClipId?: string | null;
  playheadFrame: number;
  onSelectClip: (clip: AnyClip, track: Track) => void;
  onSetPlayhead: (frame: number) => void;
  onMove: (clipId: string, newStartFrame: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", deltaFrame: number) => void;
  onSlip: (clipId: string, deltaFrame: number) => void;
}) {
  const scale = pxPerFrame(timeline.projectRate);

  function frameFromClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.round(x / scale));
  }

  return (
    <div style={{ overflowX: "auto", padding: "12px 16px" }}>
      <div
        style={{ marginLeft: LANE_LABEL_WIDTH, position: "relative" }}
        onClick={(e) => onSetPlayhead(frameFromClick(e))}
      >
        <TimeRuler
          projectRate={timeline.projectRate}
          endFrame={timelineEndFrame(timeline)}
        />
      </div>
      <div style={{ marginTop: 8, position: "relative" }}>
        <div
          aria-hidden
          title={`Playhead — frame ${playheadFrame}`}
          style={{
            position: "absolute",
            left: LANE_LABEL_WIDTH + playheadFrame * scale,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--fb-accent-to)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
        {timeline.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            timeline={timeline}
            selectedClipId={selectedClipId}
            highlightedClipId={highlightedClipId}
            onSelectClip={onSelectClip}
            onMove={onMove}
            onTrim={onTrim}
            onSlip={onSlip}
          />
        ))}
      </div>
    </div>
  );
}
