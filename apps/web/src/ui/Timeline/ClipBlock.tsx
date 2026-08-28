"use client";

import { useRef, useState } from "react";

import type { MediaRef } from "@framebranch/engine";
import {
  ImageSquare,
  MusicNotes,
  TextT,
  VideoCamera,
} from "@phosphor-icons/react";

import {
  clipLabel,
  filmstripFrameUrl,
  isTextClip,
  thumbnailUrl,
  waveformUrl,
  type AnyClip,
} from "../../lib/clip-helpers";
import { pxPerFrame, type TimelineTool } from "./scale";

const DRAG_THRESHOLD_PX = 3;

type DragMode = "move" | "trim-start" | "trim-end" | "slip";
type DragState = {
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  deltaFrames: number;
};

export function ClipBlock({
  clip,
  mediaRef,
  trackKind,
  trackHeight,
  trackColor,
  projectRate,
  pxPerSecond,
  selected,
  highlighted,
  slipEnabled,
  locked,
  tool,
  snapping,
  onSelect,
  onSetPlayhead,
  onMove,
  onTrim,
  onSlip,
  onSplit,
}: {
  clip: AnyClip;
  mediaRef: MediaRef | undefined;
  trackKind: "video" | "audio" | "text";
  trackHeight: number;
  trackColor: string;
  projectRate: number;
  pxPerSecond: number;
  selected: boolean;
  highlighted?: boolean;
  slipEnabled: boolean;
  locked: boolean;
  tool: TimelineTool;
  snapping: boolean;
  onSelect: () => void;
  onSetPlayhead: (frame: number) => void;
  onMove: (clipId: string, newStartFrame: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", deltaFrame: number) => void;
  onSlip: (clipId: string, deltaFrame: number) => void;
  onSplit: (clipId: string, atFrame: number) => void;
}) {
  const scale = pxPerFrame(projectRate, pxPerSecond);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const startValue = clip.timelineRange.start.value;
  const durationValue = clip.timelineRange.duration.value;

  const clampedDelta = clampDelta(
    drag?.mode,
    drag?.deltaFrames ?? 0,
    startValue,
    durationValue,
  );
  let left = startValue * scale;
  let width = Math.max(durationValue * scale, 4);
  if (drag?.mode === "move") left = (startValue + clampedDelta) * scale;
  else if (drag?.mode === "trim-start") {
    left = (startValue + clampedDelta) * scale;
    width = Math.max((durationValue - clampedDelta) * scale, 4);
  } else if (drag?.mode === "trim-end")
    width = Math.max((durationValue + clampedDelta) * scale, 4);

  const height = trackHeight;
  const text = isTextClip(clip);
  const label = clipLabel(clip, mediaRef);
  const isAudio = trackKind === "audio" || mediaRef?.kind === "audio";
  const isImage = mediaRef?.kind === "image";
  const hasThumb = !text && !!mediaRef && !isAudio;
  const filmstripCount = Math.min(18, Math.max(1, Math.ceil(width / 72)));
  const sourceStartSeconds = text
    ? 0
    : clip.sourceRange.start.value / clip.sourceRange.start.rate;
  const sourceDurationSeconds = text
    ? 0
    : clip.sourceRange.duration.value / clip.sourceRange.duration.rate;
  const mediaDurationSeconds = mediaRef?.durationInSource
    ? mediaRef.durationInSource.value / mediaRef.durationInSource.rate
    : sourceDurationSeconds;
  const ClipIcon = text
    ? TextT
    : isAudio
      ? MusicNotes
      : isImage
        ? ImageSquare
        : VideoCamera;

  function snappedDelta(raw: number, mode: DragMode, shiftKey: boolean) {
    if (!snapping || shiftKey || mode === "slip") return raw;
    const quantum = Math.max(1, Math.round(projectRate / 2));
    const anchor =
      mode === "trim-end" ? startValue + durationValue : startValue;
    return Math.round((anchor + raw) / quantum) * quantum - anchor;
  }

  function finishDrag(current: DragState, finalDeltaFrames: number) {
    if (finalDeltaFrames === 0) return;
    if (current.mode === "move")
      onMove(clip.id, Math.max(0, startValue + finalDeltaFrames));
    else if (current.mode === "trim-start")
      onTrim(clip.id, "start", -finalDeltaFrames);
    else if (current.mode === "trim-end")
      onTrim(clip.id, "end", finalDeltaFrames);
    else onSlip(clip.id, finalDeltaFrames);
  }

  function pointerHandlers(mode: DragMode) {
    return {
      onPointerDown: (event: React.PointerEvent) => {
        event.stopPropagation();
        if (locked || tool === "blade") return;
        (event.target as Element).setPointerCapture(event.pointerId);
        setDrag({
          mode,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          deltaFrames: 0,
        });
      },
      onPointerMove: (event: React.PointerEvent) => {
        event.stopPropagation();
        setDrag((current) => {
          if (!current || current.pointerId !== event.pointerId) return current;
          const deltaPx = event.clientX - current.startClientX;
          if (Math.abs(deltaPx) >= DRAG_THRESHOLD_PX)
            suppressClickRef.current = true;
          const raw = Math.round(deltaPx / scale);
          return {
            ...current,
            deltaFrames: snappedDelta(raw, current.mode, event.shiftKey),
          };
        });
      },
      onPointerUp: (event: React.PointerEvent) => {
        event.stopPropagation();
        const current = drag;
        setDrag(null);
        if (!current || current.pointerId !== event.pointerId) return;
        finishDrag(
          current,
          clampDelta(
            current.mode,
            current.deltaFrames,
            startValue,
            durationValue,
          ),
        );
      },
    };
  }

  const bodyHandlers = pointerHandlers("move");
  const slipHandlers = pointerHandlers("slip");

  return (
    <button
      type="button"
      className={`timeline-clip timeline-clip-${trackKind}${selected ? " is-selected" : ""}${highlighted ? " is-highlighted" : ""}${locked ? " is-locked" : ""}${tool === "blade" ? " is-blade" : ""}`}
      style={
        {
          left,
          width,
          top: 3,
          height: height - 6,
          "--track-color": trackColor,
        } as React.CSSProperties
      }
      aria-label={label}
      aria-disabled={locked}
      title={
        locked
          ? `${label} — track locked`
          : tool === "blade"
            ? `${label} — click to split`
            : slipEnabled
              ? `${label} — drag to move, edges to trim, Alt+drag to slip`
              : `${label} — drag to move, edges to trim`
      }
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          return;
        }
        onSelect();
        if (tool === "blade" && !locked && durationValue > 1) {
          const rect = event.currentTarget.getBoundingClientRect();
          const atFrame = Math.min(
            startValue + durationValue - 1,
            Math.max(
              startValue + 1,
              startValue + Math.round((event.clientX - rect.left) / scale),
            ),
          );
          onSetPlayhead(atFrame);
          onSplit(clip.id, atFrame);
        }
      }}
      onPointerDown={(event) => {
        if (slipEnabled && event.altKey) slipHandlers.onPointerDown(event);
        else bodyHandlers.onPointerDown(event);
      }}
      onPointerMove={(event) => {
        if (drag?.mode === "slip") slipHandlers.onPointerMove(event);
        else bodyHandlers.onPointerMove(event);
      }}
      onPointerUp={(event) => {
        if (drag?.mode === "slip") slipHandlers.onPointerUp(event);
        else bodyHandlers.onPointerUp(event);
      }}
    >
      {hasThumb && (
        <div
          className={`timeline-clip-filmstrip${isImage ? " is-image" : ""}`}
          aria-hidden
        >
          {Array.from({ length: isImage ? 1 : filmstripCount }, (_, index) => (
            <img
              key={index}
              src={
                isImage
                  ? thumbnailUrl(mediaRef.url)
                  : filmstripFrameUrl(
                      mediaRef.url,
                      Math.max(
                        0,
                        Math.min(
                          Math.max(0, Math.ceil(mediaDurationSeconds) - 1),
                          Math.floor(
                            sourceStartSeconds +
                              ((index + 0.5) / filmstripCount) *
                                sourceDurationSeconds,
                          ),
                        ),
                      ),
                    )
              }
              alt=""
              draggable={false}
              onError={(event) => {
                event.currentTarget.src = thumbnailUrl(mediaRef.url);
              }}
            />
          ))}
        </div>
      )}
      <div className="timeline-clip-title">
        <ClipIcon size={11} weight="fill" aria-hidden />
        <span>{label}</span>
      </div>
      {isAudio && (
        <div className="timeline-audio-band" aria-hidden>
          {mediaRef ? (
            <div className="timeline-waveform-window">
              <img
                src={waveformUrl(mediaRef.url)}
                alt=""
                draggable={false}
                style={{
                  width: `${Math.max(100, (mediaDurationSeconds / Math.max(sourceDurationSeconds, 0.001)) * 100)}%`,
                  left: `${-(sourceStartSeconds / Math.max(sourceDurationSeconds, 0.001)) * 100}%`,
                }}
              />
            </div>
          ) : (
            <MusicNotes size={14} weight="duotone" />
          )}
        </div>
      )}

      <div
        {...pointerHandlers("trim-start")}
        className="timeline-trim-handle is-start"
        title="Trim start"
      />
      <div
        {...pointerHandlers("trim-end")}
        className="timeline-trim-handle is-end"
        title="Trim end"
      />
    </button>
  );
}

function clampDelta(
  mode: DragMode | undefined,
  delta: number,
  start: number,
  duration: number,
) {
  if (mode === "move") return Math.max(-start, delta);
  if (mode === "trim-start")
    return Math.min(Math.max(-start, delta), duration - 1);
  if (mode === "trim-end") return Math.max(-(duration - 1), delta);
  return delta;
}
