"use client";

import { useRef, useState } from "react";

import type { MediaRef } from "@framebranch/engine";

import {
  clipLabel,
  isTextClip,
  thumbnailUrl,
  type AnyClip,
} from "../../lib/clip-helpers";
import { pxPerFrame, TRACK_HEIGHT } from "./scale";

/** Pixel movement below this is a click, not a drag (brief §5's verbs). */
const DRAG_THRESHOLD_PX = 3;
const HANDLE_WIDTH = 7;

type DragMode = "move" | "trim-start" | "trim-end" | "slip";

type DragState = {
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  /** Live delta in FRAMES, already rounded (A1.1: whole frames only). */
  deltaFrames: number;
};

export function ClipBlock({
  clip,
  mediaRef,
  trackKind,
  projectRate,
  selected,
  highlighted,
  slipEnabled,
  onSelect,
  onMove,
  onTrim,
  onSlip,
}: {
  clip: AnyClip;
  mediaRef: MediaRef | undefined;
  trackKind: "video" | "audio" | "text";
  projectRate: number;
  selected: boolean;
  /** §6 — the Changes panel highlights a clip when its diff line is hovered. */
  highlighted?: boolean;
  /** §5: slip is E_NOT_APPLICABLE on text/image — disabled where we can tell. */
  slipEnabled: boolean;
  onSelect: () => void;
  onMove: (clipId: string, newStartFrame: number) => void;
  onTrim: (clipId: string, edge: "start" | "end", deltaFrame: number) => void;
  onSlip: (clipId: string, deltaFrame: number) => void;
}) {
  const scale = pxPerFrame(projectRate);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const startValue = clip.timelineRange.start.value;
  const durationValue = clip.timelineRange.duration.value;

  const clampedDelta = (() => {
    if (!drag) return 0;
    if (drag.mode === "move") return Math.max(-startValue, drag.deltaFrames);
    if (drag.mode === "trim-start") {
      // Keep start >= 0 and duration >= 1 frame.
      return Math.min(
        Math.max(-startValue, drag.deltaFrames),
        durationValue - 1,
      );
    }
    if (drag.mode === "trim-end") {
      return Math.max(-(durationValue - 1), drag.deltaFrames);
    }
    return drag.deltaFrames; // slip — no positional clamp shown client-side
  })();

  let left = startValue * scale;
  let width = Math.max(durationValue * scale, 4);
  if (drag?.mode === "move") {
    left = (startValue + clampedDelta) * scale;
  } else if (drag?.mode === "trim-start") {
    left = (startValue + clampedDelta) * scale;
    width = Math.max((durationValue - clampedDelta) * scale, 4);
  } else if (drag?.mode === "trim-end") {
    width = Math.max((durationValue + clampedDelta) * scale, 4);
  }

  const height = TRACK_HEIGHT[trackKind];
  const text = isTextClip(clip);
  const label = clipLabel(clip, mediaRef);
  const hasThumb = !text && mediaRef !== undefined && mediaRef.kind !== "audio";

  function beginDrag(pointerId: number, clientX: number, mode: DragMode) {
    setDrag({ mode, pointerId, startClientX: clientX, deltaFrames: 0 });
  }

  // Dispatches the mutation for a completed drag. Must be called OUTSIDE any
  // setState updater (React may legally double-invoke updaters — under
  // StrictMode it always does — and a network call is not a pure function).
  function finishDrag(current: DragState, finalDeltaFrames: number) {
    if (finalDeltaFrames === 0) return;
    if (current.mode === "move") {
      onMove(clip.id, Math.max(0, startValue + finalDeltaFrames));
    } else if (current.mode === "trim-start") {
      // BC.3: minus = cut, plus = extend. Dragging the left edge RIGHT
      // (positive finalDeltaFrames) shortens the clip → negative delta.
      onTrim(clip.id, "start", -finalDeltaFrames);
    } else if (current.mode === "trim-end") {
      onTrim(clip.id, "end", finalDeltaFrames);
    } else if (current.mode === "slip") {
      onSlip(clip.id, finalDeltaFrames);
    }
  }

  function pointerHandlers(mode: DragMode) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        beginDrag(e.pointerId, e.clientX, mode);
      },
      onPointerMove: (e: React.PointerEvent) => {
        e.stopPropagation();
        setDrag((current) => {
          if (!current || current.pointerId !== e.pointerId) return current;
          const deltaPx = e.clientX - current.startClientX;
          if (Math.abs(deltaPx) >= DRAG_THRESHOLD_PX)
            suppressClickRef.current = true;
          return { ...current, deltaFrames: Math.round(deltaPx / scale) };
        });
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        // Read `drag` from the render closure and clear it via the pure
        // `null` form first — the mutation dispatch below happens as a
        // separate, ordinary side effect, never inside the updater itself.
        const current = drag;
        setDrag(null);
        if (!current || current.pointerId !== e.pointerId) return;
        const clamp =
          current.mode === "move"
            ? Math.max(-startValue, current.deltaFrames)
            : current.mode === "trim-start"
              ? Math.min(
                  Math.max(-startValue, current.deltaFrames),
                  durationValue - 1,
                )
              : current.mode === "trim-end"
                ? Math.max(-(durationValue - 1), current.deltaFrames)
                : current.deltaFrames;
        finishDrag(current, clamp);
      },
    };
  }

  const bodyHandlers = pointerHandlers("move");
  const slipHandlers = pointerHandlers("slip");

  return (
    <button
      type="button"
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.preventDefault();
          return;
        }
        onSelect();
      }}
      onPointerDown={(e) => {
        if (slipEnabled && e.altKey) {
          slipHandlers.onPointerDown(e);
        } else {
          bodyHandlers.onPointerDown(e);
        }
      }}
      onPointerMove={(e) => {
        if (drag?.mode === "slip") slipHandlers.onPointerMove(e);
        else bodyHandlers.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        if (drag?.mode === "slip") slipHandlers.onPointerUp(e);
        else bodyHandlers.onPointerUp(e);
      }}
      title={
        slipEnabled
          ? `${label} — drag to move, edges to trim, Alt+drag to slip`
          : `${label} — drag to move, edges to trim`
      }
      className="motion-hover"
      style={{
        position: "absolute",
        left,
        width,
        top: 3,
        height: height - 6,
        borderRadius: "var(--fb-radius-sm)",
        border: "none",
        padding: 0,
        overflow: "hidden",
        cursor: drag?.mode === "slip" ? "ew-resize" : "grab",
        textAlign: "left",
        background: hasThumb ? "var(--fb-panel-2)" : "var(--fb-panel)",
        boxShadow: selected
          ? "0 0 0 1.5px var(--fb-accent-to), inset 0 1px 0 rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.3)"
          : highlighted
            ? "0 0 0 1.5px var(--fb-warn), inset 0 1px 0 rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.3)"
            : "inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.05)",
      }}
    >
      {hasThumb && (
        <img
          src={thumbnailUrl(mediaRef!.url)}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.55,
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: trackKind === "audio" ? "center" : "flex-start",
          height: "100%",
          padding: "4px 6px",
          background: hasThumb
            ? "linear-gradient(180deg, rgba(13,13,18,.15), rgba(13,13,18,.75))"
            : trackKind === "audio"
              ? "repeating-linear-gradient(90deg, rgba(79,162,255,.18) 0 2px, transparent 2px 6px)"
              : undefined,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 500,
            color: "var(--fb-text-body-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </span>
      </div>

      {/* Trim handles — small hit-strips at each edge, own pointer capture. */}
      <div
        {...pointerHandlers("trim-start")}
        title="Trim start"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: HANDLE_WIDTH,
          cursor: "ew-resize",
          background:
            drag?.mode === "trim-start" ? "var(--fb-accent-to)" : "transparent",
        }}
      />
      <div
        {...pointerHandlers("trim-end")}
        title="Trim end"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: HANDLE_WIDTH,
          cursor: "ew-resize",
          background:
            drag?.mode === "trim-end" ? "var(--fb-accent-to)" : "transparent",
        }}
      />
    </button>
  );
}
