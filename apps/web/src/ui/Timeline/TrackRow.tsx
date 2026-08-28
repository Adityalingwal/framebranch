"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Command, MediaRef, Timeline, Track } from "@framebranch/engine";
import {
  Copy,
  DotsSixVertical,
  DotsThree,
  Eye,
  EyeSlash,
  LockSimple,
  LockSimpleOpen,
  Minus,
  MusicNotes,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  TextT,
  Trash,
  VideoCamera,
} from "@phosphor-icons/react";

import {
  findMediaRef,
  isTextClip,
  labelFromMediaUrl,
  type AnyClip,
} from "../../lib/clip-helpers";
import { ClipBlock } from "./ClipBlock";
import {
  LANE_LABEL_WIDTH,
  pxPerFrame,
  trackColor,
  trackHeight,
  type TimelineTool,
} from "./scale";

const TRACK_ICON = { video: VideoCamera, audio: MusicNotes, text: TextT };
const TRACK_COLORS = ["#4fa2ff", "#3fcf8e", "#f2b84b", "#b78cff", "#f07178"];

export function TrackRow({
  track,
  trackLabel,
  timeline,
  canvasWidth,
  pxPerSecond,
  selectedClipId,
  highlightedClipId,
  hidden,
  muted,
  locked,
  tool,
  snapping,
  playheadFrame,
  onAddClip,
  onToggleHidden,
  onToggleMuted,
  onToggleLocked,
  onSelectClip,
  onSetPlayhead,
  onMove,
  onTrim,
  onSlip,
  onSplit,
  onRename,
  onAppearanceChange,
  onDuplicate,
  onRemove,
  onDropTrack,
}: {
  track: Track;
  trackLabel: string;
  timeline: Timeline;
  canvasWidth: number;
  pxPerSecond: number;
  selectedClipId: string | null;
  highlightedClipId?: string | null;
  hidden: boolean;
  muted: boolean;
  locked: boolean;
  tool: TimelineTool;
  snapping: boolean;
  playheadFrame: number;
  onAddClip: (command: Command) => void;
  onToggleHidden: () => void;
  onToggleMuted: () => void;
  onToggleLocked: () => void;
  onSelectClip: (clip: AnyClip, track: Track) => void;
  onSetPlayhead: (frame: number) => void;
  onMove: (clipId: string, newStartFrame: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", deltaFrame: number) => void;
  onSlip: (clipId: string, deltaFrame: number) => void;
  onSplit: (clipId: string, atFrame: number) => void;
  onRename: (name: string) => void;
  onAppearanceChange: (changes: Pick<Track, "color" | "height">) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDropTrack: (sourceId: string, targetId: string) => void;
}) {
  const height = trackHeight(track);
  const color = trackColor(track);
  const scale = pxPerFrame(timeline.projectRate, pxPerSecond);
  const TrackIcon = TRACK_ICON[track.kind];
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(track.name ?? trackLabel);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const rate = timeline.projectRate;

  // Project media this track can host (video tracks also take images).
  const addableMedia = timeline.mediaRefs.filter((ref: MediaRef) =>
    track.kind === "video"
      ? ref.kind === "video" || ref.kind === "image"
      : ref.kind === track.kind,
  );

  /** First frame at/after `from` where a clip of `durationFrames` fits. */
  function freeStartFrom(from: number, durationFrames: number): number {
    const sorted = [...track.clips].sort(
      (a, b) => a.timelineRange.start.value - b.timelineRange.start.value,
    );
    let start = from;
    for (const clip of sorted) {
      const clipStart = clip.timelineRange.start.value;
      const clipEnd = clipStart + clip.timelineRange.duration.value;
      if (start < clipEnd && start + durationFrames > clipStart) {
        start = clipEnd;
      }
    }
    return start;
  }

  function addMediaClip(ref: MediaRef) {
    const durationFrames = ref.durationInSource?.value ?? 4 * rate;
    const start = freeStartFrom(playheadFrame, durationFrames);
    onAddClip({
      op: "addClip",
      trackId: track.id,
      mediaRefId: ref.id,
      sourceRange: {
        start: { value: ref.sourceStartInFile?.value ?? 0, rate },
        duration: { value: durationFrames, rate },
      },
      timelineRange: {
        start: { value: start, rate },
        duration: { value: durationFrames, rate },
      },
    } as Command);
    setMenuOpen(false);
  }

  function addTextClip() {
    const durationFrames = 3 * rate;
    const start = freeStartFrom(playheadFrame, durationFrames);
    onAddClip({
      op: "addClip",
      trackId: track.id,
      textContent: "New text",
      textStyle: { font: "Arial", size: 48, color: "#ffffff" },
      timelineRange: {
        start: { value: start, rate },
        duration: { value: durationFrames, rate },
      },
    } as Command);
    setMenuOpen(false);
  }

  useEffect(
    () => setDraftName(track.name ?? trackLabel),
    [track.name, trackLabel],
  );
  useEffect(() => {
    if (!menuOpen) return;
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      // Measure the rendered menu — its height varies by track kind (the
      // add-clip items). If it doesn't fit below the button, flip it above.
      const menuHeight = popupRef.current?.offsetHeight ?? 300;
      const fitsBelow = rect.bottom + 5 + menuHeight <= window.innerHeight - 8;
      setMenuPosition({
        top: fitsBelow
          ? rect.bottom + 5
          : Math.max(8, rect.top - menuHeight - 5),
        left: Math.max(8, rect.right - 198),
      });
    }
    const close = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!menuRef.current?.contains(node) && !popupRef.current?.contains(node))
        setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  function commitName() {
    const next = draftName.trim();
    if (next && next !== (track.name ?? trackLabel)) onRename(next);
    else setDraftName(track.name ?? trackLabel);
    setRenaming(false);
  }

  return (
    <div
      className={`timeline-track-row${locked ? " is-locked" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/framebranch-track");
        if (sourceId) onDropTrack(sourceId, track.id);
      }}
    >
      <div
        className="timeline-track-header"
        style={
          {
            width: LANE_LABEL_WIDTH,
            height,
            "--track-color": color,
          } as React.CSSProperties
        }
      >
        <button
          type="button"
          className="track-drag-handle"
          draggable
          aria-label={`Reorder ${track.name ?? trackLabel}`}
          title="Drag to reorder track"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/framebranch-track", track.id);
          }}
        >
          <DotsSixVertical size={14} weight="bold" aria-hidden />
        </button>
        <div className="timeline-track-identity">
          <TrackIcon size={14} weight="duotone" aria-hidden style={{ color }} />
          <div>
            {renaming ? (
              <input
                autoFocus
                className="track-name-input"
                aria-label="Track name"
                value={draftName}
                maxLength={80}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitName();
                  if (event.key === "Escape") {
                    setDraftName(track.name ?? trackLabel);
                    setRenaming(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="track-name-button"
                title="Double-click to rename"
                onDoubleClick={() => setRenaming(true)}
              >
                {track.name ?? trackLabel}
              </button>
            )}
            <small>{track.kind}</small>
          </div>
        </div>
        <div className="timeline-track-actions">
          <button
            type="button"
            aria-pressed={hidden}
            title={hidden ? "Show track" : "Hide track"}
            onClick={onToggleHidden}
          >
            {hidden ? (
              <EyeSlash size={13} aria-hidden />
            ) : (
              <Eye size={13} aria-hidden />
            )}
          </button>
          {track.kind === "audio" && (
            <button
              type="button"
              aria-pressed={muted}
              title={muted ? "Unmute track" : "Mute track"}
              onClick={onToggleMuted}
            >
              {muted ? (
                <SpeakerSlash size={13} aria-hidden />
              ) : (
                <SpeakerHigh size={13} aria-hidden />
              )}
            </button>
          )}
          <button
            type="button"
            aria-pressed={locked}
            title={locked ? "Unlock track" : "Lock track"}
            onClick={onToggleLocked}
          >
            {locked ? (
              <LockSimple size={13} weight="fill" aria-hidden />
            ) : (
              <LockSimpleOpen size={13} aria-hidden />
            )}
          </button>
          <div ref={menuRef} className="track-menu-anchor">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Track options"
              title="Track options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <DotsThree size={15} weight="bold" aria-hidden />
            </button>
            {menuOpen &&
              createPortal(
                <div
                  ref={popupRef}
                  className="track-menu is-floating"
                  role="menu"
                  style={menuPosition}
                >
                  {track.kind === "text" ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={locked}
                      onClick={addTextClip}
                    >
                      <Plus size={14} aria-hidden /> Add text clip
                    </button>
                  ) : addableMedia.length > 0 ? (
                    addableMedia.map((ref) => (
                      <button
                        key={ref.id}
                        type="button"
                        role="menuitem"
                        disabled={locked}
                        onClick={() => addMediaClip(ref)}
                      >
                        <Plus size={14} aria-hidden /> Add{" "}
                        {labelFromMediaUrl(ref.url)}
                      </button>
                    ))
                  ) : (
                    <button type="button" role="menuitem" disabled>
                      No project media for this track
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setRenaming(true);
                      setMenuOpen(false);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onDuplicate();
                      setMenuOpen(false);
                    }}
                  >
                    <Copy size={14} aria-hidden /> Duplicate track
                  </button>
                  <div className="track-menu-section">
                    <span>Colour</span>
                    <div className="track-color-options">
                      {TRACK_COLORS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-label={`Set track colour ${option}`}
                          aria-pressed={color === option}
                          style={{ background: option }}
                          onClick={() => onAppearanceChange({ color: option })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="track-height-control">
                    <span>Height</span>
                    <button
                      type="button"
                      aria-label="Decrease track height"
                      disabled={height <= 32}
                      onClick={() =>
                        onAppearanceChange({ height: Math.max(32, height - 8) })
                      }
                    >
                      <Minus size={12} aria-hidden />
                    </button>
                    <strong>{height}</strong>
                    <button
                      type="button"
                      aria-label="Increase track height"
                      disabled={height >= 120}
                      onClick={() =>
                        onAppearanceChange({
                          height: Math.min(120, height + 8),
                        })
                      }
                    >
                      <Plus size={12} aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      onRemove();
                      setMenuOpen(false);
                    }}
                  >
                    <Trash size={14} aria-hidden /> Remove track
                  </button>
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>

      <div
        className="timeline-lane lane-sunken"
        style={
          {
            width: canvasWidth,
            height,
            "--track-color": color,
            "--second-width": `${pxPerSecond}px`,
          } as React.CSSProperties
        }
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const rawFrame = Math.max(
            0,
            Math.round((event.clientX - rect.left) / scale),
          );
          const quantum = snapping
            ? Math.max(1, Math.round(timeline.projectRate / 2))
            : 1;
          onSetPlayhead(Math.round(rawFrame / quantum) * quantum);
        }}
      >
        <div className="timeline-lane-grid" aria-hidden />
        <div
          className={`timeline-lane-clips${hidden ? " is-hidden" : ""}${muted ? " is-muted" : ""}`}
        >
          {(track.clips as AnyClip[]).map((clip) => {
            const mediaRef = isTextClip(clip)
              ? undefined
              : findMediaRef(timeline, clip.mediaRefId);
            return (
              <ClipBlock
                key={clip.id}
                clip={clip}
                mediaRef={mediaRef}
                trackKind={track.kind}
                trackHeight={height}
                trackColor={color}
                projectRate={timeline.projectRate}
                pxPerSecond={pxPerSecond}
                selected={clip.id === selectedClipId}
                highlighted={clip.id === highlightedClipId}
                slipEnabled={!isTextClip(clip) && mediaRef?.kind !== "image"}
                locked={locked}
                tool={tool}
                snapping={snapping}
                onSelect={() => onSelectClip(clip, track)}
                onSetPlayhead={onSetPlayhead}
                onMove={onMove}
                onTrim={onTrim}
                onSlip={onSlip}
                onSplit={onSplit}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
