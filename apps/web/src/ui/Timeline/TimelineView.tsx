import type { Timeline, Track } from "@framebranch/engine";

import type { AnyClip } from "../../lib/clip-helpers";
import { timelineEndFrame } from "./scale";
import { TimeRuler } from "./TimeRuler";
import { TrackRow } from "./TrackRow";

/**
 * §8.1 — DOM divs (M8 lock 3), read-only in M8a: tracks top to bottom,
 * clips positioned by `timelineRange` scaled by a fixed zoom factor, gaps
 * are just the empty space between clips (never rendered as an object).
 * 10-30 clips is the design size — no virtualization (locked).
 */
export function TimelineView({
  timeline,
  selectedClipId,
  onSelectClip,
}: {
  timeline: Timeline;
  selectedClipId: string | null;
  onSelectClip: (clip: AnyClip, track: Track) => void;
}) {
  return (
    <div style={{ overflowX: "auto", padding: "12px 16px" }}>
      <div style={{ marginLeft: 96 }}>
        <TimeRuler
          projectRate={timeline.projectRate}
          endFrame={timelineEndFrame(timeline)}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        {timeline.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            timeline={timeline}
            selectedClipId={selectedClipId}
            onSelectClip={onSelectClip}
          />
        ))}
      </div>
    </div>
  );
}
