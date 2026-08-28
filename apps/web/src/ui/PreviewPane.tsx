"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowsOutSimple,
  FilmStrip,
  MusicNotes,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  UploadSimple,
} from "@phosphor-icons/react";

import type { MediaRef } from "@framebranch/engine";

import { clipLabel, isTextClip, type AnyClip } from "../lib/clip-helpers";
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
  playheadFrame,
  projectRate,
  onSetPlayhead,
}: {
  clip: AnyClip | null;
  mediaRef: MediaRef | undefined;
  playheadFrame: number;
  projectRate: number;
  onSetPlayhead: (frame: number) => void;
}) {
  if (!clip) {
    return (
      <Frame>
        <div
          className="preview-empty-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            window.dispatchEvent(new Event("framebranch:open-import"));
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--fb-radius-lg)",
              color: "var(--fb-accent-from)",
              background: "rgba(79, 162, 255, 0.08)",
              border: "1px solid rgba(79, 162, 255, 0.14)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
            }}
          >
            <FilmStrip size={23} weight="duotone" aria-hidden />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span
              style={{
                color: "var(--fb-text-body-2)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Select a clip to start editing
            </span>
            <span style={{ color: "var(--fb-text-dim)", fontSize: 11.5 }}>
              Choose a timeline clip or import project media
            </span>
          </div>
          <button
            type="button"
            className="preview-import-button"
            onClick={() =>
              window.dispatchEvent(new Event("framebranch:open-import"))
            }
          >
            <UploadSimple size={14} weight="bold" aria-hidden />
            Import media
          </button>
          <small>Drop a project file here</small>
        </div>
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
              fontFamily:
                FONT_BY_TEXT_FONT[clip.textStyle.font] ?? "sans-serif",
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
        <AudioClipMedia
          url={mediaRef.url}
          label={clipLabel(clip, mediaRef)}
          start={start}
          end={end}
          volume={volume}
          timelineStartFrame={clip.timelineRange.start.value}
          projectRate={projectRate}
          playheadFrame={playheadFrame}
          onSetPlayhead={onSetPlayhead}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <VideoClipMedia
        url={mediaRef.url}
        start={start}
        end={end}
        volume={volume}
        timelineStartFrame={clip.timelineRange.start.value}
        projectRate={projectRate}
        playheadFrame={playheadFrame}
        onSetPlayhead={onSetPlayhead}
      />
    </Frame>
  );
}

function VideoClipMedia({
  url,
  start,
  end,
  volume,
  timelineStartFrame,
  projectRate,
  playheadFrame,
  onSetPlayhead,
}: {
  url: string;
  start: number;
  end: number;
  volume: number;
  timelineStartFrame: number;
  projectRate: number;
  playheadFrame: number;
  onSetPlayhead: (frame: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(start);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(Math.min(1, Math.max(0, volume)));
  const duration = Math.max(0, end - start);
  const playheadRef = useRef(playheadFrame);
  const lastEmittedFrameRef = useRef(playheadFrame);

  useEffect(() => {
    playheadRef.current = playheadFrame;
  }, [playheadFrame]);

  function emitPlayhead(mediaTime: number) {
    const frame = mediaTimeToTimelineFrame(
      mediaTime,
      start,
      timelineStartFrame,
      projectRate,
    );
    if (frame === lastEmittedFrameRef.current) return;
    lastEmittedFrameRef.current = frame;
    onSetPlayhead(frame);
  }

  function togglePlayback() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      if (el.currentTime >= end) {
        el.currentTime = start;
        emitPlayhead(start);
      }
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoaded = () => {
      const syncedTime = timelineFrameToMediaTime(
        playheadRef.current,
        timelineStartFrame,
        projectRate,
        start,
        end,
      );
      el.currentTime = syncedTime;
      el.volume = Math.min(1, Math.max(0, volume));
      setCurrentTime(syncedTime);
      setLevel(el.volume);
      el.play().catch(() => {});
    };
    const onTimeUpdate = () => {
      if (el.currentTime >= end) {
        el.currentTime = end;
        setCurrentTime(end);
        emitPlayhead(end);
        el.pause();
        return;
      }
      setCurrentTime(Math.max(start, el.currentTime));
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setMuted(el.muted);
      setLevel(el.volume);
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolumeChange);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("volumechange", onVolumeChange);
    };
  }, [start, end, volume, url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || isPlaying) return;
    const syncedTime = timelineFrameToMediaTime(
      playheadFrame,
      timelineStartFrame,
      projectRate,
      start,
      end,
    );
    if (Math.abs(el.currentTime - syncedTime) > 0.02) {
      el.currentTime = syncedTime;
      setCurrentTime(syncedTime);
    }
  }, [playheadFrame, timelineStartFrame, projectRate, start, end, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    let animationFrame = 0;
    const update = () => {
      const el = ref.current;
      if (!el || el.paused) return;
      const mediaTime = Math.min(end, Math.max(start, el.currentTime));
      setCurrentTime(mediaTime);
      emitPlayhead(mediaTime);
      if (mediaTime < end) animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, start, end, timelineStartFrame, projectRate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      const el = ref.current;
      if (!el) return;
      if (el.paused) {
        if (el.currentTime >= end) el.currentTime = start;
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [start, end]);

  return (
    <div
      ref={frameRef}
      role="region"
      aria-label="Video preview"
      tabIndex={0}
      className={`preview-media-shell${isPlaying ? " is-playing" : ""}`}
    >
      <video
        ref={ref}
        key={url}
        src={url}
        playsInline
        style={{ width: "100%", height: "100%", background: "#000" }}
      />
      <div className="preview-controls" aria-label="Preview playback controls">
        <button
          type="button"
          className="preview-control-button"
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          onClick={togglePlayback}
        >
          {isPlaying ? (
            <Pause size={16} weight="fill" aria-hidden />
          ) : (
            <Play size={16} weight="fill" aria-hidden />
          )}
        </button>
        <span className="preview-time">
          {formatPreviewTime(currentTime - start)}
        </span>
        <input
          type="range"
          className="preview-seek"
          aria-label="Preview position"
          min={0}
          max={duration || 0.01}
          step={0.01}
          value={Math.min(duration, Math.max(0, currentTime - start))}
          style={
            {
              "--val": `${duration > 0 ? ((currentTime - start) / duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
          onInput={(event) => {
            const el = ref.current;
            if (!el) return;
            const next = start + Number(event.currentTarget.value);
            el.currentTime = next;
            setCurrentTime(next);
            emitPlayhead(next);
          }}
        />
        <span className="preview-time">{formatPreviewTime(duration)}</span>
        <button
          type="button"
          className="preview-control-button"
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          title={muted ? "Unmute" : "Mute"}
          onClick={() => {
            if (ref.current) ref.current.muted = !ref.current.muted;
          }}
        >
          {muted || level === 0 ? (
            <SpeakerSlash size={16} weight="duotone" aria-hidden />
          ) : (
            <SpeakerHigh size={16} weight="duotone" aria-hidden />
          )}
        </button>
        <input
          type="range"
          className="preview-volume"
          aria-label="Preview volume"
          min={0}
          max={1}
          step={0.01}
          value={level}
          style={{ "--val": `${level * 100}%` } as React.CSSProperties}
          onInput={(event) => {
            const el = ref.current;
            if (!el) return;
            const next = Number(event.currentTarget.value);
            el.volume = next;
            if (next > 0) el.muted = false;
            setLevel(next);
          }}
        />
        <button
          type="button"
          className="preview-control-button"
          aria-label="Enter fullscreen preview"
          title="Fullscreen"
          onClick={() => frameRef.current?.requestFullscreen().catch(() => {})}
        >
          <ArrowsOutSimple size={16} weight="duotone" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function formatPreviewTime(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function AudioClipMedia({
  url,
  label,
  start,
  end,
  volume,
  timelineStartFrame,
  projectRate,
  playheadFrame,
  onSetPlayhead,
}: {
  url: string;
  label: string;
  start: number;
  end: number;
  volume: number;
  timelineStartFrame: number;
  projectRate: number;
  playheadFrame: number;
  onSetPlayhead: (frame: number) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(start);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(Math.min(1, Math.max(0, volume)));
  const duration = Math.max(0, end - start);
  const playheadRef = useRef(playheadFrame);
  const lastEmittedFrameRef = useRef(playheadFrame);

  useEffect(() => {
    playheadRef.current = playheadFrame;
  }, [playheadFrame]);

  function emitPlayhead(mediaTime: number) {
    const frame = mediaTimeToTimelineFrame(
      mediaTime,
      start,
      timelineStartFrame,
      projectRate,
    );
    if (frame === lastEmittedFrameRef.current) return;
    lastEmittedFrameRef.current = frame;
    onSetPlayhead(frame);
  }

  function togglePlayback() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      if (el.currentTime >= end) {
        el.currentTime = start;
        emitPlayhead(start);
      }
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoaded = () => {
      const syncedTime = timelineFrameToMediaTime(
        playheadRef.current,
        timelineStartFrame,
        projectRate,
        start,
        end,
      );
      el.currentTime = syncedTime;
      el.volume = Math.min(1, Math.max(0, volume));
      setCurrentTime(syncedTime);
      setLevel(el.volume);
    };
    const onTimeUpdate = () => {
      if (el.currentTime >= end) {
        el.currentTime = end;
        setCurrentTime(end);
        emitPlayhead(end);
        el.pause();
        return;
      }
      setCurrentTime(Math.max(start, el.currentTime));
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolumeChange = () => {
      setMuted(el.muted);
      setLevel(el.volume);
    };
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolumeChange);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("volumechange", onVolumeChange);
    };
  }, [start, end, volume, url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || isPlaying) return;
    const syncedTime = timelineFrameToMediaTime(
      playheadFrame,
      timelineStartFrame,
      projectRate,
      start,
      end,
    );
    if (Math.abs(el.currentTime - syncedTime) > 0.02) {
      el.currentTime = syncedTime;
      setCurrentTime(syncedTime);
    }
  }, [playheadFrame, timelineStartFrame, projectRate, start, end, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    let animationFrame = 0;
    const update = () => {
      const el = ref.current;
      if (!el || el.paused) return;
      const mediaTime = Math.min(end, Math.max(start, el.currentTime));
      setCurrentTime(mediaTime);
      emitPlayhead(mediaTime);
      if (mediaTime < end) animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, start, end, timelineStartFrame, projectRate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      togglePlayback();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      role="region"
      aria-label="Audio preview"
      tabIndex={0}
      className={`preview-media-shell audio-preview-shell${isPlaying ? " is-playing" : ""}`}
    >
      <audio ref={ref} key={url} src={url} preload="metadata" />
      <div className="audio-preview-identity">
        <div className="audio-preview-icon">
          <MusicNotes size={26} weight="duotone" aria-hidden />
        </div>
        <div className="audio-preview-copy">
          <span>{label}</span>
          <small>Audio clip · {formatPreviewTime(duration)}</small>
        </div>
      </div>
      <div
        className="preview-controls audio-preview-controls"
        aria-label="Preview playback controls"
      >
        <button
          type="button"
          className="preview-control-button"
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          onClick={togglePlayback}
        >
          {isPlaying ? (
            <Pause size={16} weight="fill" aria-hidden />
          ) : (
            <Play size={16} weight="fill" aria-hidden />
          )}
        </button>
        <span className="preview-time">
          {formatPreviewTime(currentTime - start)}
        </span>
        <input
          type="range"
          className="preview-seek"
          aria-label="Preview position"
          min={0}
          max={duration || 0.01}
          step={0.01}
          value={Math.min(duration, Math.max(0, currentTime - start))}
          style={
            {
              "--val": `${duration > 0 ? ((currentTime - start) / duration) * 100 : 0}%`,
            } as React.CSSProperties
          }
          onInput={(event) => {
            const el = ref.current;
            if (!el) return;
            const next = start + Number(event.currentTarget.value);
            el.currentTime = next;
            setCurrentTime(next);
            emitPlayhead(next);
          }}
        />
        <span className="preview-time">{formatPreviewTime(duration)}</span>
        <button
          type="button"
          className="preview-control-button"
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          title={muted ? "Unmute" : "Mute"}
          onClick={() => {
            if (ref.current) ref.current.muted = !ref.current.muted;
          }}
        >
          {muted || level === 0 ? (
            <SpeakerSlash size={16} weight="duotone" aria-hidden />
          ) : (
            <SpeakerHigh size={16} weight="duotone" aria-hidden />
          )}
        </button>
        <input
          type="range"
          className="preview-volume"
          aria-label="Preview volume"
          min={0}
          max={1}
          step={0.01}
          value={level}
          style={{ "--val": `${level * 100}%` } as React.CSSProperties}
          onInput={(event) => {
            const el = ref.current;
            if (!el) return;
            const next = Number(event.currentTarget.value);
            el.volume = next;
            if (next > 0) el.muted = false;
            setLevel(next);
          }}
        />
      </div>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="surface preview-frame"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {children}
    </div>
  );
}

function timelineFrameToMediaTime(
  frame: number,
  timelineStartFrame: number,
  projectRate: number,
  sourceStart: number,
  sourceEnd: number,
) {
  const safeRate = Math.max(1, projectRate);
  const mediaTime = sourceStart + (frame - timelineStartFrame) / safeRate;
  return Math.min(sourceEnd, Math.max(sourceStart, mediaTime));
}

function mediaTimeToTimelineFrame(
  mediaTime: number,
  sourceStart: number,
  timelineStartFrame: number,
  projectRate: number,
) {
  return Math.max(
    0,
    timelineStartFrame +
      Math.round((mediaTime - sourceStart) * Math.max(1, projectRate)),
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
        padding: 24,
        color: "var(--fb-text-mute)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}
