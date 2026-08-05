"use client";

import { useEffect, useRef } from "react";

import type { MediaRef } from "@framebranch/engine";

import { isTextClip, type AnyClip } from "../lib/clip-helpers";
import { toSeconds } from "../lib/format";

const FONT_BY_TEXT_FONT: Record<string, string> = {
  Arial: "Arial, sans-serif",
  Georgia: "Georgia, serif",
  "Courier New": '"Courier New", monospace',
};

/**
 * §8.2 — Level A preview: clicking a clip plays THAT clip only (full
 * timeline playback is explicitly a non-goal). A media ref that does not
 * resolve shows "Media unavailable" and nothing else breaks (HLD #12/#13).
 */
export function PreviewPane({
  clip,
  mediaRef,
}: {
  clip: AnyClip | null;
  mediaRef: MediaRef | undefined;
}) {
  if (!clip) {
    return (
      <Frame>
        <Empty>Select a clip to preview it</Empty>
      </Frame>
    );
  }

  if (isTextClip(clip)) {
    return (
      <Frame>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
          }}
        >
          <span
            style={{
              fontFamily: FONT_BY_TEXT_FONT[clip.textStyle.font] ?? "sans-serif",
              fontSize: Math.min(clip.textStyle.size, 64),
              color: clip.textStyle.color,
              textAlign: "center",
              padding: 16,
            }}
          >
            {clip.textContent}
          </span>
        </div>
      </Frame>
    );
  }

  if (!mediaRef) {
    return (
      <Frame>
        <Empty>Media unavailable</Empty>
      </Frame>
    );
  }

  if (mediaRef.kind === "image") {
    return (
      <Frame>
        <img
          src={mediaRef.url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </Frame>
    );
  }

  const start = toSeconds(clip.sourceRange.start);
  const end = start + toSeconds(clip.sourceRange.duration);
  const volume = (clip.properties.volume ?? 100) / 100;

  if (mediaRef.kind === "audio") {
    return (
      <Frame>
        <AudioClipMedia url={mediaRef.url} start={start} end={end} volume={volume} />
      </Frame>
    );
  }

  return (
    <Frame>
      <VideoClipMedia url={mediaRef.url} start={start} end={end} volume={volume} />
    </Frame>
  );
}

function VideoClipMedia({
  url,
  start,
  end,
  volume,
}: {
  url: string;
  start: number;
  end: number;
  volume: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoaded = () => {
      el.currentTime = start;
      el.volume = Math.min(1, Math.max(0, volume));
      el.play().catch(() => {});
    };
    const onTimeUpdate = () => {
      if (el.currentTime >= end) el.pause();
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [start, end, volume, url]);

  return (
    <video
      ref={ref}
      key={url}
      src={url}
      controls
      style={{ width: "100%", height: "100%", background: "#000" }}
    />
  );
}

function AudioClipMedia({
  url,
  start,
  end,
  volume,
}: {
  url: string;
  start: number;
  end: number;
  volume: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoaded = () => {
      el.currentTime = start;
      el.volume = Math.min(1, Math.max(0, volume));
      el.play().catch(() => {});
    };
    const onTimeUpdate = () => {
      if (el.currentTime >= end) el.pause();
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [start, end, volume, url]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background:
          "repeating-linear-gradient(90deg, rgba(79,162,255,.12) 0 3px, transparent 3px 9px)",
      }}
    >
      <span style={{ fontSize: 28, color: "var(--fb-accent-from)" }}>♪</span>
      <audio ref={ref} key={url} src={url} controls style={{ width: "80%" }} />
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="surface"
      style={{
        aspectRatio: "16 / 9",
        width: "100%",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fb-text-mute)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}
