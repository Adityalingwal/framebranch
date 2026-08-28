"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Command, Timeline, Track, TrackKind } from "@framebranch/engine";
import {
  Cursor,
  Magnet,
  Minus,
  Plus,
  Scissors,
} from "@phosphor-icons/react";

import type { AnyClip } from "../../lib/clip-helpers";
import {
  DEFAULT_PX_PER_SECOND,
  LANE_LABEL_WIDTH,
  MAX_PX_PER_SECOND,
  MIN_PX_PER_SECOND,
  pxPerFrame,
  timelineEndFrame,
} from "./scale";
import { TimeRuler } from "./TimeRuler";
import { TrackRow } from "./TrackRow";

import type { TimelineTool } from "./scale";

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
  onSplit,
  onAddClip,
  onReplaceTracks,
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
  onSplit: (clipId: string, atFrame: number) => void;
  onAddClip: (command: Command) => void;
  onReplaceTracks: (tracks: Track[]) => void;
}) {
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [snapping, setSnapping] = useState(true);
  const [hiddenTracks, setHiddenTracks] = useState<Set<string>>(
    () => new Set(),
  );
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(() => new Set());
  const [lockedTracks, setLockedTracks] = useState<Set<string>>(
    () => new Set(),
  );
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerCanvasRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const addTrackRef = useRef<HTMLDivElement>(null);
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const scale = pxPerFrame(timeline.projectRate, pxPerSecond);
  const visibleEndFrame = timelineEndFrame(timeline) + timeline.projectRate * 2;
  const totalSeconds = Math.ceil(visibleEndFrame / timeline.projectRate) + 1;
  const canvasWidth = Math.max(720, totalSeconds * pxPerSecond);

  useEffect(() => {
    const region = scrollRegionRef.current;
    if (!region) return;
    const playheadX = LANE_LABEL_WIDTH + playheadFrame * scale;
    const margin = 64;
    const visibleStart = region.scrollLeft + LANE_LABEL_WIDTH + margin;
    const visibleEnd = region.scrollLeft + region.clientWidth - margin;
    if (playheadX < visibleStart) {
      region.scrollLeft = Math.max(0, playheadX - LANE_LABEL_WIDTH - margin);
    } else if (playheadX > visibleEnd) {
      region.scrollLeft = Math.max(0, playheadX - region.clientWidth + margin);
    }
  }, [playheadFrame, scale]);

  // The playhead lives in content coordinates; once horizontal scroll puts
  // it behind the sticky track-header column it must vanish entirely —
  // no z-index arrangement can clip it against the 5px gaps between rows.
  useEffect(() => {
    const region = scrollRegionRef.current;
    const playhead = playheadRef.current;
    if (!region || !playhead) return;
    const sync = () => {
      const viewportX =
        LANE_LABEL_WIDTH + playheadFrame * scale - region.scrollLeft;
      playhead.style.visibility =
        viewportX < LANE_LABEL_WIDTH ? "hidden" : "visible";
    };
    sync();
    region.addEventListener("scroll", sync, { passive: true });
    return () => region.removeEventListener("scroll", sync);
  }, [playheadFrame, scale]);

  // Scrubbing: pointer-drag on the ruler (or the playhead bubble) moves the
  // playhead continuously — pointer capture keeps the drag alive even as the
  // bubble moves under the cursor.
  function scrubToClientX(clientX: number) {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    onSetPlayhead(Math.max(0, Math.round((clientX - rect.left) / scale)));
  }

  function scrubHandlers(): Pick<
    React.DOMAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  > {
    return {
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        scrubbingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        scrubToClientX(event.clientX);
      },
      onPointerMove: (event) => {
        if (scrubbingRef.current) scrubToClientX(event.clientX);
      },
      onPointerUp: () => {
        scrubbingRef.current = false;
      },
      onPointerCancel: () => {
        scrubbingRef.current = false;
      },
    };
  }

  const trackLabels = useMemo(() => {
    const counts = { video: 0, audio: 0, text: 0 };
    return new Map(
      timeline.tracks.map((track) => {
        counts[track.kind] += 1;
        const prefix =
          track.kind === "video" ? "V" : track.kind === "audio" ? "A" : "T";
        return [track.id, `${prefix}${counts[track.kind]}`];
      }),
    );
  }, [timeline.tracks]);

  function toggleTrack(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setZoom(next: number) {
    setPxPerSecond(
      Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, next)),
    );
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "v") setTool("select");
      else if (key === "b") setTool("blade");
      else if (key === "s") setSnapping((value) => !value);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!addTrackOpen) return;
    const close = (event: PointerEvent) => {
      if (!addTrackRef.current?.contains(event.target as Node)) {
        setAddTrackOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [addTrackOpen]);

  function addTrack(kind: TrackKind) {
    const count = timeline.tracks.filter((track) => track.kind === kind).length;
    const prefix =
      kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Text";
    onReplaceTracks([
      ...timeline.tracks,
      {
        id: `track-${crypto.randomUUID()}`,
        kind,
        name: `${prefix} ${count + 1}`,
        clips: [],
      },
    ]);
    setAddTrackOpen(false);
  }

  function updateTrack(trackId: string, update: Partial<Track>) {
    onReplaceTracks(
      timeline.tracks.map((track) =>
        track.id === trackId ? { ...track, ...update } : track,
      ),
    );
  }

  function duplicateTrack(trackId: string) {
    const index = timeline.tracks.findIndex((track) => track.id === trackId);
    if (index < 0) return;
    const source = timeline.tracks[index];
    const duplicateId = `track-${crypto.randomUUID()}`;
    const duplicate: Track = {
      ...source,
      id: duplicateId,
      name: `${source.name ?? trackLabels.get(source.id) ?? source.kind} copy`,
      clips: source.clips.map((clip, clipIndex) => ({
        ...clip,
        id: `${duplicateId}-clip-${clipIndex}`,
      })) as Track["clips"],
    };
    const next = [...timeline.tracks];
    next.splice(index + 1, 0, duplicate);
    onReplaceTracks(next);
  }

  function reorderTrack(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = [...timeline.tracks];
    const sourceIndex = next.findIndex((track) => track.id === sourceId);
    const targetIndex = next.findIndex((track) => track.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReplaceTracks(next);
  }

  return (
    <section className="timeline-editor" aria-label="Timeline editor">
      <div className="timeline-tools" aria-label="Timeline tools">
        <div className="timeline-tool-group" aria-label="Editing mode">
          <button
            type="button"
            className={`timeline-tool-button${tool === "select" ? " is-active" : ""}`}
            aria-pressed={tool === "select"}
            title="Select tool (V)"
            onClick={() => setTool("select")}
          >
            <Cursor size={15} weight="duotone" aria-hidden />
            <span>Select</span>
          </button>
          <button
            type="button"
            className={`timeline-tool-button${tool === "blade" ? " is-active" : ""}`}
            aria-pressed={tool === "blade"}
            title="Blade tool — click a clip to split (B)"
            onClick={() => setTool("blade")}
          >
            <Scissors size={15} weight="duotone" aria-hidden />
            <span>Blade</span>
          </button>
        </div>

        <span className="timeline-tools-divider" aria-hidden />

        <button
          type="button"
          className={`timeline-tool-button${snapping ? " is-active" : ""}`}
          aria-pressed={snapping}
          title={`${snapping ? "Snapping on" : "Snapping off"} (S)`}
          onClick={() => setSnapping((value) => !value)}
        >
          <Magnet size={15} weight="duotone" aria-hidden />
          <span>Snap</span>
        </button>

        <span className="timeline-tools-divider" aria-hidden />

        <div ref={addTrackRef} className="track-add-anchor">
          <button
            type="button"
            className="timeline-tool-button"
            aria-expanded={addTrackOpen}
            aria-haspopup="menu"
            title="Add track"
            onClick={() => setAddTrackOpen((value) => !value)}
          >
            <Plus size={15} weight="bold" aria-hidden />
            <span>Add track</span>
          </button>
          {addTrackOpen && (
            <div className="track-add-menu" role="menu">
              {(["video", "audio", "text"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onClick={() => addTrack(kind)}
                >
                  {kind === "video"
                    ? "Video track"
                    : kind === "audio"
                      ? "Audio track"
                      : "Text track"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="timeline-timecode"
          aria-label="Current playhead timecode"
        >
          {formatTimecode(playheadFrame, timeline.projectRate)}
        </div>

        <div className="timeline-zoom" aria-label="Timeline zoom">
          <button
            type="button"
            title="Zoom out"
            onClick={() => setZoom(pxPerSecond - 12)}
          >
            <Minus size={13} aria-hidden />
          </button>
          <input
            type="range"
            min={MIN_PX_PER_SECOND}
            max={MAX_PX_PER_SECOND}
            step={4}
            value={pxPerSecond}
            aria-label="Timeline zoom level"
            style={
              {
                "--val": `${((pxPerSecond - MIN_PX_PER_SECOND) / (MAX_PX_PER_SECOND - MIN_PX_PER_SECOND)) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <button
            type="button"
            title="Zoom in"
            onClick={() => setZoom(pxPerSecond + 12)}
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
      </div>

      <div ref={scrollRegionRef} className="timeline-scroll-region">
        <div
          className="timeline-content"
          style={{ width: LANE_LABEL_WIDTH + canvasWidth }}
        >
          <div className="timeline-ruler-row">
            <div className="timeline-ruler-corner">Tracks</div>
            <div
              ref={rulerCanvasRef}
              className="timeline-ruler-canvas"
              style={{ width: canvasWidth }}
              {...scrubHandlers()}
            >
              <TimeRuler
                projectRate={timeline.projectRate}
                endFrame={visibleEndFrame}
                pxPerSecond={pxPerSecond}
              />
            </div>
          </div>

          <div className="timeline-track-stack">
            {timeline.tracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                trackLabel={trackLabels.get(track.id) ?? track.kind}
                timeline={timeline}
                canvasWidth={canvasWidth}
                pxPerSecond={pxPerSecond}
                selectedClipId={selectedClipId}
                highlightedClipId={highlightedClipId}
                hidden={hiddenTracks.has(track.id)}
                muted={mutedTracks.has(track.id)}
                locked={lockedTracks.has(track.id)}
                tool={tool}
                snapping={snapping}
                playheadFrame={playheadFrame}
                onAddClip={onAddClip}
                onToggleHidden={() => toggleTrack(setHiddenTracks, track.id)}
                onToggleMuted={() => toggleTrack(setMutedTracks, track.id)}
                onToggleLocked={() => toggleTrack(setLockedTracks, track.id)}
                onSelectClip={onSelectClip}
                onSetPlayhead={onSetPlayhead}
                onMove={onMove}
                onTrim={onTrim}
                onSlip={onSlip}
                onSplit={onSplit}
                onRename={(name) => updateTrack(track.id, { name })}
                onAppearanceChange={(changes) => updateTrack(track.id, changes)}
                onDuplicate={() => duplicateTrack(track.id)}
                onRemove={() =>
                  onReplaceTracks(
                    timeline.tracks.filter((item) => item.id !== track.id),
                  )
                }
                onDropTrack={reorderTrack}
              />
            ))}
            <div className="track-ghost-row">
              <span>Add track</span>
              {(["video", "audio", "text"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  style={
                    {
                      "--ghost-kind": `var(--fb-track-${kind})`,
                    } as React.CSSProperties
                  }
                  onClick={() => addTrack(kind)}
                >
                  <Plus size={11} weight="bold" aria-hidden />
                  {kind === "video" ? "Video" : kind === "audio" ? "Audio" : "Text"}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={playheadRef}
            className="timeline-playhead"
            aria-hidden
            style={{ left: LANE_LABEL_WIDTH + playheadFrame * scale }}
          >
            <span className="timeline-playhead-bubble" {...scrubHandlers()}>
              {formatTimecode(playheadFrame, timeline.projectRate).slice(3, 8)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatTimecode(frame: number, rate: number) {
  const safeRate = Math.max(1, Math.round(rate));
  const totalSeconds = Math.floor(frame / safeRate);
  const frames = Math.max(0, frame % safeRate);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds, frames]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
