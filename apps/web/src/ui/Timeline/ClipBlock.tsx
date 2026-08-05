import type { MediaRef } from "@framebranch/engine";

import {
  clipLabel,
  isTextClip,
  thumbnailUrl,
  type AnyClip,
} from "../../lib/clip-helpers";
import { pxPerFrame, TRACK_HEIGHT } from "./scale";

export function ClipBlock({
  clip,
  mediaRef,
  trackKind,
  projectRate,
  selected,
  onSelect,
}: {
  clip: AnyClip;
  mediaRef: MediaRef | undefined;
  trackKind: "video" | "audio" | "text";
  projectRate: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const scale = pxPerFrame(projectRate);
  const left = clip.timelineRange.start.value * scale;
  const width = Math.max(clip.timelineRange.duration.value * scale, 4);
  const height = TRACK_HEIGHT[trackKind];
  const text = isTextClip(clip);
  const label = clipLabel(clip, mediaRef);
  const hasThumb = !text && mediaRef !== undefined && mediaRef.kind !== "audio";

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
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
        cursor: "pointer",
        textAlign: "left",
        background: hasThumb ? "var(--fb-panel-2)" : "var(--fb-panel)",
        boxShadow: selected
          ? "0 0 0 1.5px var(--fb-accent-to), inset 0 1px 0 rgba(255,255,255,.08), 0 3px 8px rgba(0,0,0,.3)"
          : "inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.05)",
      }}
    >
      {hasThumb && (
        <img
          src={thumbnailUrl(mediaRef!.url)}
          alt=""
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
    </button>
  );
}
