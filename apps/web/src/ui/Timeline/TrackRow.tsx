import type { Timeline, Track } from "@framebranch/engine";

import { findMediaRef, isTextClip, type AnyClip } from "../../lib/clip-helpers";
import { ClipBlock } from "./ClipBlock";
import { PX_PER_SECOND, TRACK_HEIGHT, timelineEndFrame } from "./scale";

const TRACK_ICON: Record<Track["kind"], string> = {
  video: "▭",
  audio: "♪",
  text: "T",
};

export function TrackRow({
  track,
  timeline,
  selectedClipId,
  onSelectClip,
}: {
  track: Track;
  timeline: Timeline;
  selectedClipId: string | null;
  onSelectClip: (clip: AnyClip, track: Track) => void;
}) {
  const totalSeconds = Math.ceil(timelineEndFrame(timeline) / timeline.projectRate) + 1;
  const widthPx = totalSeconds * PX_PER_SECOND;
  const height = TRACK_HEIGHT[track.kind];

  return (
    <div style={{ display: "flex", marginBottom: 6 }}>
      <div
        style={{
          width: 96,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingRight: 8,
          fontSize: 10.5,
          color: "var(--fb-text-mute)",
          textTransform: "capitalize",
        }}
      >
        <span aria-hidden style={{ color: "var(--fb-text-dim)" }}>
          {TRACK_ICON[track.kind]}
        </span>
        {track.kind}
      </div>
      <div
        className="lane-sunken"
        style={{ position: "relative", width: widthPx, height }}
      >
        {(track.clips as AnyClip[]).map((clip) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            mediaRef={
              isTextClip(clip)
                ? undefined
                : findMediaRef(timeline, clip.mediaRefId)
            }
            trackKind={track.kind}
            projectRate={timeline.projectRate}
            selected={clip.id === selectedClipId}
            onSelect={() => onSelectClip(clip, track)}
          />
        ))}
      </div>
    </div>
  );
}
