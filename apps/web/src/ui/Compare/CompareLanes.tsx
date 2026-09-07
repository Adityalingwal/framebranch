"use client";

import { useEffect, useMemo, useRef } from "react";

import type { Timeline, Track } from "@framebranch/engine";

import {
  clipDisplayName,
  findMediaRef,
  isTextClip,
  thumbnailUrl,
  trackDisplayName,
  type AnyClip,
} from "../../lib/clip-helpers";
import type { DiffRow } from "../../server/diff-rows";
import { pxPerFrame, timelineEndFrame } from "../Timeline/scale";
import { TimeRuler } from "../Timeline/TimeRuler";

/**
 * B2 §2.6 — the two lanes that REPLACE the editing timeline while Compare
 * is open (lock (1)). Before above, After below (D4(2)), each showing ALL
 * of its own timeline's tracks (lock (2)) so a `Moved to track` is visible
 * rather than merely readable.
 *
 * Read-only by construction: no tools, no zoom, no track menus, no drag or
 * trim handles. The only interactions are scrubbing the shared playhead,
 * hovering a clip (which lights its row) and clicking one (which sends the
 * player there).
 *
 * The lanes never compute what changed — that is the presenter's `laneIds`
 * (§2.1). Colour and highlight both read it, so a row and its clips can
 * never disagree.
 */

/** Fixed zoom: the lanes are for reading, not for frame work. */
const COMPARE_PX_PER_SECOND = 60;
/** Narrower than the editor's 208px — the lanes need the width for clips. */
const COMPARE_LABEL_WIDTH = 88;
/**
 * Compact per-kind heights. The editor's 56/44/36 × 3 tracks × 2 lanes plus
 * the ruler does not fit the 330px default timeline area (250 minimum).
 */
const COMPARE_TRACK_HEIGHT: Record<Track["kind"], number> = {
  video: 28,
  audio: 22,
  text: 18,
};

type Side = "before" | "after";
/** `is-removed` / `is-added` win over `is-changed`; anything unlisted dims. */
type ClipTone = "is-removed" | "is-added" | "is-changed";

export function CompareLanes({
  before,
  after,
  beforeLabel,
  afterLabel,
  rows,
  playheadFrame,
  onSetPlayhead,
  highlightedClipIds,
  onHighlightClip,
  onClipClick,
}: {
  before: Timeline;
  after: Timeline;
  /** #111 / #112 — the card name (or `Now`); B3 passes different text. */
  beforeLabel: string;
  afterLabel: string;
  rows: DiffRow[];
  playheadFrame: number;
  onSetPlayhead: (frame: number) => void;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onClipClick: (side: Side, clipId: string) => void;
}) {
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerCanvasRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);

  // ONE scale and ONE canvas width for both lanes: the LONGER timeline sets
  // it, so the two are directly comparable by eye (D4(2)).
  const rate = after.projectRate;
  const scale = pxPerFrame(rate, COMPARE_PX_PER_SECOND);
  const visibleEndFrame =
    Math.max(timelineEndFrame(before), timelineEndFrame(after)) + rate * 2;
  const totalSeconds = Math.ceil(visibleEndFrame / rate) + 1;
  const canvasWidth = Math.max(480, totalSeconds * COMPARE_PX_PER_SECOND);

  const tones = useMemo(() => toneMaps(rows), [rows]);

  // The playhead follows a row click out of view (same rule as the editor).
  useEffect(() => {
    const region = scrollRegionRef.current;
    if (!region) return;
    const playheadX = COMPARE_LABEL_WIDTH + playheadFrame * scale;
    const margin = 64;
    const visibleStart = region.scrollLeft + COMPARE_LABEL_WIDTH + margin;
    const visibleEnd = region.scrollLeft + region.clientWidth - margin;
    if (playheadX < visibleStart) {
      region.scrollLeft = Math.max(0, playheadX - COMPARE_LABEL_WIDTH - margin);
    } else if (playheadX > visibleEnd) {
      region.scrollLeft = Math.max(0, playheadX - region.clientWidth + margin);
    }
  }, [playheadFrame, scale]);

  // Once horizontal scroll puts the playhead behind the sticky label column
  // it must vanish entirely — no z-index can clip it against the gaps.
  useEffect(() => {
    const region = scrollRegionRef.current;
    const playhead = playheadRef.current;
    if (!region || !playhead) return;
    const sync = () => {
      const viewportX =
        COMPARE_LABEL_WIDTH + playheadFrame * scale - region.scrollLeft;
      playhead.style.visibility =
        viewportX < COMPARE_LABEL_WIDTH ? "hidden" : "visible";
    };
    sync();
    region.addEventListener("scroll", sync, { passive: true });
    return () => region.removeEventListener("scroll", sync);
  }, [playheadFrame, scale]);

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

  return (
    <section className="compare-lanes" aria-label="Compare">
      <div ref={scrollRegionRef} className="compare-scroll-region">
        <div
          className="compare-content"
          style={{ width: COMPARE_LABEL_WIDTH + canvasWidth }}
        >
          <div className="compare-ruler-row">
            <div
              className="compare-ruler-corner"
              style={{ width: COMPARE_LABEL_WIDTH }}
            />
            <div
              ref={rulerCanvasRef}
              className="compare-ruler-canvas"
              style={{ width: canvasWidth }}
              {...scrubHandlers()}
            >
              <TimeRuler
                projectRate={rate}
                endFrame={visibleEndFrame}
                pxPerSecond={COMPARE_PX_PER_SECOND}
              />
            </div>
          </div>

          <Lane
            side="before"
            timeline={before}
            label={beforeLabel}
            tones={tones.before}
            canvasWidth={canvasWidth}
            scale={scale}
            highlightedClipIds={highlightedClipIds}
            onHighlightClip={onHighlightClip}
            onClipClick={onClipClick}
            scrubHandlers={scrubHandlers}
          />
          <Lane
            side="after"
            timeline={after}
            label={afterLabel}
            tones={tones.after}
            canvasWidth={canvasWidth}
            scale={scale}
            highlightedClipIds={highlightedClipIds}
            onHighlightClip={onHighlightClip}
            onClipClick={onClipClick}
            scrubHandlers={scrubHandlers}
          />

          {/* Lock (3) — ONE playhead, spanning the ruler and both lanes. */}
          <div
            ref={playheadRef}
            className="compare-playhead"
            aria-hidden
            style={{ left: COMPARE_LABEL_WIDTH + playheadFrame * scale }}
          />
        </div>
      </div>
    </section>
  );
}

function Lane({
  side,
  timeline,
  label,
  tones,
  canvasWidth,
  scale,
  highlightedClipIds,
  onHighlightClip,
  onClipClick,
  scrubHandlers,
}: {
  side: Side;
  timeline: Timeline;
  label: string;
  tones: Map<string, ClipTone>;
  canvasWidth: number;
  scale: number;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onClipClick: (side: Side, clipId: string) => void;
  scrubHandlers: () => Pick<
    React.DOMAttributes<HTMLElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
}) {
  return (
    <div className={`compare-lane is-${side}`}>
      {/* #110 + #111/#112 — the lane says what it is once: `Before` big,
          the card name (or `Now`) beneath it. No time: the card carries it. */}
      <div className="compare-lane-head" style={{ width: COMPARE_LABEL_WIDTH }}>
        <b>{side === "before" ? "Before" : "After"}</b>
        {label && <small title={label}>{label}</small>}
      </div>
      <div className="compare-lane-tracks">
        {timeline.tracks.map((track) => (
          <div
            key={track.id}
            className="compare-track-row"
            style={{ height: COMPARE_TRACK_HEIGHT[track.kind] }}
          >
            <div
              className="compare-track-label"
              style={{ width: COMPARE_LABEL_WIDTH }}
            >
              {trackDisplayName(track, timeline)}
            </div>
            <div
              className={`compare-track-canvas is-${track.kind}`}
              style={{ width: canvasWidth }}
              {...scrubHandlers()}
            >
              {(track.clips as AnyClip[]).map((clip) => (
                <CompareClip
                  key={clip.id}
                  clip={clip}
                  timeline={timeline}
                  scale={scale}
                  tone={tones.get(clip.id)}
                  hot={highlightedClipIds.includes(clip.id)}
                  onHover={() => onHighlightClip([clip.id])}
                  onLeave={() => onHighlightClip([])}
                  onClick={() => onClipClick(side, clip.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareClip({
  clip,
  timeline,
  scale,
  tone,
  hot,
  onHover,
  onLeave,
  onClick,
}: {
  clip: AnyClip;
  timeline: Timeline;
  scale: number;
  tone: ClipTone | undefined;
  hot: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const mediaRef = isTextClip(clip)
    ? undefined
    : findMediaRef(timeline, clip.mediaRefId);
  const thumb =
    mediaRef && mediaRef.kind !== "audio" ? thumbnailUrl(mediaRef.url) : null;
  const left = clip.timelineRange.start.value * scale;
  const width = Math.max(2, clip.timelineRange.duration.value * scale);
  return (
    <button
      type="button"
      className={`compare-clip ${tone ?? "is-same"}${hot ? " is-hot" : ""}`}
      style={{
        left,
        width,
        ...(thumb ? { backgroundImage: `url(${thumb})` } : {}),
      }}
      title={clipDisplayName(clip, mediaRef)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      // The canvas underneath scrubs the playhead; a clip click is its own
      // thing (it sends the player to that clip on that side).
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      <span>{clipDisplayName(clip, mediaRef)}</span>
    </button>
  );
}

/**
 * D4(2) — colour, per lane, straight from the rows' `laneIds`:
 *   Before lane, a `removed` row's clip → bad;
 *   After lane, an `added` row's clip    → good;
 *   every other changed clip, both lanes → accent.
 * A clip in several rows keeps the strongest: added/removed over accent,
 * accent over unchanged (which simply has no entry and dims).
 */
function toneMaps(rows: DiffRow[]): {
  before: Map<string, ClipTone>;
  after: Map<string, ClipTone>;
} {
  const before = new Map<string, ClipTone>();
  const after = new Map<string, ClipTone>();
  const put = (map: Map<string, ClipTone>, id: string, tone: ClipTone) => {
    if (tone === "is-changed" && map.has(id)) return;
    map.set(id, tone);
  };
  for (const row of rows) {
    for (const id of row.laneIds.before) {
      put(before, id, row.kind === "removed" ? "is-removed" : "is-changed");
    }
    for (const id of row.laneIds.after) {
      put(after, id, row.kind === "added" ? "is-added" : "is-changed");
    }
  }
  return { before, after };
}
