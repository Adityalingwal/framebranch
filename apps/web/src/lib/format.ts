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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * C5 #77 — the ONE time format the product shows. Relative time
 * (`3m ago`) is gone: versions are points in time you compare, so the
 * clock is what tells you which is which.
 *
 *   same calendar day        → `5:11 pm`
 *   within the previous 6    → `Tue 5:11 pm`
 *   older (or in the future) → `4 Sep, 5:11 pm`
 *
 * Hand-rolled and locale-independent on purpose: `toLocaleString` would
 * make the string follow the viewer's machine, and the lock names exact
 * shapes (12-hour, no leading zero on the hour, lowercase am/pm, no
 * year — demo-lens). Day distance is counted in CALENDAR days from the
 * local date parts, so a DST shift cannot move a card to another day.
 */
export function formatClock(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const hours24 = at.getHours();
  const hour = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const clock = `${hour}:${pad(at.getMinutes())} ${hours24 < 12 ? "am" : "pm"}`;

  const startOfDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round(
    (startOfDay(now) - startOfDay(at)) / (24 * 60 * 60 * 1000),
  );

  if (daysAgo === 0) return clock;
  if (daysAgo >= 1 && daysAgo <= 6) return `${WEEKDAYS[at.getDay()]} ${clock}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}, ${clock}`;
}
