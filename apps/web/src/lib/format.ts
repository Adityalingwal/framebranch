/**
 * format.ts — display-only formatting. A1.1 lock: time stays `{value,
 * rate}` integers everywhere except right here, at render time (M8a sends
 * nothing back to the server, but the habit is kept per the brief).
 */

import type { RationalTime } from "@framebranch/engine";

function pad(n: number, width = 2): string {
  return String(Math.max(0, Math.trunc(n))).toString().padStart(width, "0");
}

/** `{value, rate}` → `mm:ss:ff` (or `hh:mm:ss:ff` past an hour). */
export function formatTimecode(t: RationalTime): string {
  const rate = Math.round(t.rate) || 1;
  const totalFrames = Math.max(0, Math.round(t.value));
  const frames = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
    : `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function toSeconds(t: RationalTime): number {
  return t.value / t.rate;
}

/** Coarse relative time for the History panel ("3m ago", "yesterday"). */
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
