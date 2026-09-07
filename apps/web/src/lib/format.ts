/**
 * format.ts — display-only formatting. A1.1 lock: time stays `{value,
 * rate}` integers everywhere except right here, at render time. Shared by
 * UI and server (the diff presenter) — framework-free.
 *
 * D4(4) / C5 C-3: timecode is ALWAYS the full 4-part `HH:MM:SS:FF`, hours
 * included even when 00 — a 3-part `00:12:00` reads as "12 minutes". This
 * applies to positions, durations and runtime alike.
 */

import type { RationalTime } from "@framebranch/engine";

function pad(n: number, width = 2): string {
  return String(Math.max(0, Math.trunc(n))).padStart(width, "0");
}

/** `frames` at `rate` → `HH:MM:SS:FF`. Frame 0 → `00:00:00:00`. */
export function formatFrames(frames: number, rate: number): string {
  const safeRate = Math.round(rate) || 1;
  const totalFrames = Math.max(0, Math.round(frames));
  const ff = totalFrames % safeRate;
  const totalSeconds = Math.floor(totalFrames / safeRate);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(ff)}`;
}

/** `{value, rate}` → `HH:MM:SS:FF`, always 4-part. */
export function formatTimecode(t: RationalTime): string {
  return formatFrames(t.value, t.rate);
}

export function toSeconds(t: RationalTime): number {
  return t.value / t.rate;
}

/**
 * Coarse relative time ("3m ago"). UI-only: C5 replaces every use with
 * clock time in B1/B5; nothing server-facing may call this.
 */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
