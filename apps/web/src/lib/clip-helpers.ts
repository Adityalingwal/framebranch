/**
 * clip-helpers.ts — small, framework-free helpers for rendering the
 * engine's `Clip | TextClip` union.
 *
 * NOTE on clip labels (spec gap, resolved here — see findings): the engine's
 * `Clip` type (packages/engine/src/types.ts) carries no `name`/`label`
 * field — only `id`, `mediaRefId`, ranges, `properties`, `lineage`. OTIO
 * clip names exist only at import time and are not part of the committed
 * domain model. The brief (§8.1) asks the timeline to show "its name/label"
 * per clip; the smallest option consistent with the lock is to derive a
 * readable label from the referenced media's filename (e.g.
 * "/media/interview.mp4" → "Interview"), falling back to the clip id.
 */

import type { Clip, MediaRef, TextClip, Timeline } from "@framebranch/engine";

export type AnyClip = Clip | TextClip;

export function isTextClip(clip: AnyClip): clip is TextClip {
  return "textContent" in clip;
}

export function findMediaRef(
  timeline: Timeline,
  mediaRefId: string,
): MediaRef | undefined {
  return timeline.mediaRefs.find((ref) => ref.id === mediaRefId);
}

/**
 * M8b — selection is kept as an id (Shell.tsx), never a snapshot object:
 * every edit replaces the timeline in the query cache, and a stored object
 * reference would go stale the instant its own value changed (e.g. a
 * volume slider would keep showing the pre-drag number). This is the one
 * read site that turns an id back into the live clip.
 */
export function findClipById(
  timeline: Timeline,
  clipId: string,
): AnyClip | undefined {
  for (const track of timeline.tracks) {
    const clip = (track.clips as AnyClip[]).find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/** `/media/interview.mp4` → `interview` */
function fileStem(url: string): string {
  const base = url.split("/").pop() ?? url;
  return base.replace(/\.[^./]+$/, "");
}

/** `/media/interview.mp4` → `Interview` (spec gap — see file header). */
export function labelFromMediaUrl(url: string): string {
  const stem = fileStem(url);
  const words = stem.replace(/[-_]+/g, " ").trim();
  if (words.length === 0) return stem;
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function clipLabel(
  clip: AnyClip,
  mediaRef: MediaRef | undefined,
): string {
  if (isTextClip(clip)) return clip.textContent || "(empty text)";
  if (mediaRef) return labelFromMediaUrl(mediaRef.url);
  return `Clip ${clip.id}`;
}

/**
 * M8 lock 6 — thumbnails are pre-made images, one `.jpg` per media
 * fixture, sharing the media's own filename stem
 * (apps/web/public/thumbnails/<stem>.jpg — thumbnails are pre-generated).
 */
export function thumbnailUrl(mediaUrl: string): string {
  return `/thumbnails/${fileStem(mediaUrl)}.jpg`;
}
