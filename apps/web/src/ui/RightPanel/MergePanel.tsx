"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MergeChoice, MergeConflict, Timeline } from "@framebranch/engine";

import { ApiClientError } from "../../lib/api-client";
import { findClipById, isTextClip, type AnyClip } from "../../lib/clip-helpers";
import { formatTimecode } from "../../lib/format";
import { recordHead } from "../../lib/head-tracking";
import {
  useMergeAbortMutation,
  useMergeResolveMutation,
  useMergeStartMutation,
  useTimelineQuery,
} from "../../lib/hooks";
import { queryKeys } from "../../lib/query-keys";
import { showToast } from "../../lib/toast-status";
import { ConfirmDialog } from "../ConfirmDialog";
import { primaryButton, secondaryButton, textInput } from "../styles";

/**
 * §7 — the Merge panel, Level 2 (locked; Level 1 text-only and Level 3
 * live-preview-and-drag were both rejected — docs/07 PRD 5.3).
 *
 * Bars caveat (reported, not invented around — see the M8b findings file):
 * no endpoint returns the merge's `base` timeline (only the engine computes
 * it, internally, per merge call — `server/merge.ts` `loadMergeSides` never
 * sends it over the wire) or the `ours`/`theirs` snapshots the conflict was
 * actually computed from. What CAN be shown accurately is each side's
 * CURRENT branch timeline (`GET /api/timeline?branch=`) — accurate because
 * both branches are auto-sealed the instant a merge starts (docs/09 6a(4)),
 * so "current" and "the merge's ours/theirs" agree unless something edits
 * either branch again while the merge stays open (the same situation
 * `E_STALE_HEAD` already exists to catch). The Base row has no accurate
 * source at all and is rendered as a clearly-labelled placeholder rather
 * than invented data.
 */
type Attempt = {
  attemptId: string;
  fromBranch: string;
  conflicts: MergeConflict[];
  counts: { total: number; resolved: number; remaining: number };
};

export function MergePanel({
  currentBranch,
  knownBranches,
  onBranchTouched,
}: {
  currentBranch: string;
  knownBranches: string[];
  onBranchTouched: (branch: string) => void;
}) {
  void onBranchTouched; // reserved: merge never creates a branch, kept for a symmetric RightPanel prop surface

  const queryClient = useQueryClient();
  const [fromBranch, setFromBranch] = useState<string>(
    knownBranches.find((b) => b !== currentBranch) ?? "",
  );
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [staleHead, setStaleHead] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const mergeStart = useMergeStartMutation();
  const mergeResolve = useMergeResolveMutation();
  const mergeAbort = useMergeAbortMutation();

  const ours = useTimelineQuery(currentBranch);
  const theirs = useTimelineQuery(attempt?.fromBranch ?? fromBranch);

  function finalizeInvalidate() {
    queryClient.invalidateQueries({ queryKey: queryKeys.timeline(currentBranch) });
    queryClient.invalidateQueries({ queryKey: queryKeys.history() });
  }

  function startMerge() {
    if (!fromBranch) return;
    setStaleHead(null);
    const mergingFrom = fromBranch;
    mergeStart.mutate(
      { from: mergingFrom, into: currentBranch },
      {
        onSuccess: (data) => {
          // docs/09 6a(4): starting a merge is a boundary — EITHER side, if
          // dirty, is auto-sealed before the merge is even computed. That
          // happens whether or not conflicts come back, so both branches'
          // cached timeline/history need a refetch either way (the `done`
          // path below already re-invalidates `currentBranch`, which is
          // harmless — invalidate is idempotent).
          queryClient.invalidateQueries({
            queryKey: queryKeys.timeline(currentBranch),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.timeline(mergingFrom),
          });
          queryClient.invalidateQueries({ queryKey: queryKeys.history() });

          if ("done" in data) {
            recordHead(currentBranch, data.mergeCommitId);
            showToast("Merge complete — no conflicts.");
            return;
          }
          setAttempt({
            attemptId: data.attemptId,
            fromBranch: mergingFrom,
            conflicts: data.conflicts,
            counts: data.counts,
          });
        },
      },
    );
  }

  function resolve(conflictId: string, choice: MergeChoice) {
    if (!attempt) return;
    setStaleHead(null);
    mergeResolve.mutate(
      { attemptId: attempt.attemptId, conflictId, choice },
      {
        onSuccess: (data) => {
          if ("done" in data) {
            recordHead(currentBranch, data.mergeCommitId);
            finalizeInvalidate();
            setAttempt(null);
            showToast("Merge complete.");
            return;
          }
          // B3.4 — fresh, honest recompute; new conflicts can legitimately
          // appear and are shown immediately, never hidden.
          setAttempt({ ...attempt, conflicts: data.conflicts, counts: data.counts });
        },
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === "E_STALE_HEAD") {
            setStaleHead(
              `"${currentBranch}" changed while you were merging — restart the merge.`,
            );
          }
        },
      },
    );
  }

  function confirmCancel() {
    if (!attempt) return;
    mergeAbort.mutate(
      { attemptId: attempt.attemptId },
      {
        onSuccess: () => {
          setAttempt(null);
          setStaleHead(null);
          setCancelOpen(false);
          showToast("Merge cancelled — nothing changed.");
        },
      },
    );
  }

  function restartMerge() {
    setAttempt(null);
    setStaleHead(null);
  }

  const otherBranches = knownBranches.filter((b) => b !== currentBranch);

  if (!attempt) {
    return (
      <div>
        {staleHead && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: "var(--fb-warn)",
              marginBottom: 12,
              lineHeight: 1.4,
            }}
          >
            {staleHead}
          </div>
        )}
        {otherBranches.length === 0 ? (
          <Empty>Create another branch first to merge it in.</Empty>
        ) : (
          <>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "var(--fb-text-mute)",
                marginBottom: 12,
              }}
            >
              <span>Merge</span>
              <select
                value={fromBranch}
                onChange={(e) => setFromBranch(e.target.value)}
                style={{ ...textInput, width: "auto", flex: 1 }}
              >
                {otherBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <span>into &ldquo;{currentBranch}&rdquo;</span>
            </label>
            <button
              type="button"
              style={
                mergeStart.isPending
                  ? { ...primaryButton, opacity: 0.6 }
                  : primaryButton
              }
              disabled={mergeStart.isPending || !fromBranch}
              onClick={startMerge}
            >
              {mergeStart.isPending ? "Starting…" : "Start merge"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {staleHead ? (
        <div
          role="alert"
          className="surface"
          style={{ padding: 12, marginBottom: 12 }}
        >
          <p style={{ fontSize: 12, color: "var(--fb-warn)", margin: "0 0 10px" }}>
            {staleHead}
          </p>
          <button type="button" style={primaryButton} onClick={restartMerge}>
            Restart merge
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 11, color: "var(--fb-text-mute)", margin: "0 0 12px" }}>
          {attempt.counts.resolved} resolved · {attempt.counts.remaining} remaining
          {attempt.counts.total > attempt.counts.resolved + attempt.counts.remaining
            ? "" // never true — counts are always self-consistent (B3.4)
            : ""}
        </p>
      )}

      {!staleHead && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {attempt.conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.conflictId}
              conflict={conflict}
              ours={ours.data?.timeline}
              theirs={theirs.data?.timeline}
              disabled={mergeResolve.isPending}
              onChoose={(choice) => resolve(conflict.conflictId, choice)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => setCancelOpen(true)}
        >
          Cancel merge
        </button>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel merge?"
        description={`This discards the merge in progress. "${currentBranch}" is untouched either way — nothing has been written yet.`}
        confirmLabel="Cancel merge"
        busy={mergeAbort.isPending}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

const BUCKET_BUTTONS: Record<1 | 2 | 3, { label: string; choice: MergeChoice }[]> = {
  1: [
    { label: "Keep yours", choice: "ours" },
    { label: "Keep agent's", choice: "theirs" },
    { label: "Keep original", choice: "base" },
  ],
  2: [
    { label: "Keep delete", choice: "delete" },
    { label: "Keep clip", choice: "clip" },
    { label: "Keep original", choice: "base" },
  ],
  3: [
    { label: "Shift A", choice: "shift-a" },
    { label: "Shift B", choice: "shift-b" },
    { label: "Remove both — back to original", choice: "base" },
  ],
};

function ConflictCard({
  conflict,
  ours,
  theirs,
  disabled,
  onChoose,
}: {
  conflict: MergeConflict;
  ours: Timeline | undefined;
  theirs: Timeline | undefined;
  disabled?: boolean;
  onChoose: (choice: MergeChoice) => void;
}) {
  const buttons = BUCKET_BUTTONS[conflict.bucket].filter((b) =>
    conflict.choices.includes(b.choice),
  );
  const clipIds =
    "clipIds" in conflict.participants ? conflict.participants.clipIds : [];
  const field = "field" in conflict.participants ? conflict.participants.field : null;

  return (
    <div className="surface" style={{ padding: 10 }}>
      <p style={{ fontSize: 12, color: "var(--fb-text-body-2)", margin: "0 0 8px" }}>
        {conflict.explanation}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        <SideBar label="Base" tone="muted" note="original — not available to preview" />
        {clipIds.map((clipId) => (
          <SideBar
            key={`ours-${clipId}`}
            label="Yours"
            tone="ours"
            note={describeClip(ours, clipId, field)}
          />
        ))}
        {clipIds.map((clipId) => (
          <SideBar
            key={`theirs-${clipId}`}
            label="Agent's"
            tone="theirs"
            note={describeClip(theirs, clipId, field)}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {buttons.map((b) => (
          <button
            key={b.choice}
            type="button"
            style={{
              ...secondaryButton,
              padding: "4px 10px",
              fontSize: 11,
              ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
            }}
            disabled={disabled}
            onClick={() => onChoose(b.choice)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SideBar({
  label,
  tone,
  note,
}: {
  label: string;
  tone: "muted" | "ours" | "theirs";
  note: string;
}) {
  const color =
    tone === "muted"
      ? "var(--fb-text-mute)"
      : tone === "ours"
        ? "var(--fb-accent-to)"
        : "var(--fb-warn)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5 }}>
      <span style={{ width: 44, flexShrink: 0, color: "var(--fb-text-mute)" }}>
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 16,
          borderRadius: "var(--fb-radius-sm)",
          background: tone === "muted" ? "transparent" : color,
          opacity: tone === "muted" ? 1 : 0.28,
          border: tone === "muted" ? `1px dashed ${color}` : "none",
        }}
      />
      <span style={{ color: "var(--fb-text-dim)", flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={note}>
        {note}
      </span>
    </div>
  );
}

/** UI-only formatting — not a re-implementation of any verb/merge rule. */
function describeClip(
  timeline: Timeline | undefined,
  clipId: string,
  field: string | null,
): string {
  if (!timeline) return "…";
  const clip = findClipById(timeline, clipId);
  if (!clip) return "deleted";
  if (!field) {
    return `${formatTimecode(clip.timelineRange.start)} · ${clip.timelineRange.duration.value}f`;
  }
  return describeField(clip, field);
}

function describeField(clip: AnyClip, field: string): string {
  switch (field) {
    case "volume":
      return !isTextClip(clip) ? `Volume ${clip.properties.volume ?? 100}%` : "—";
    case "opacity": {
      const opacity = isTextClip(clip)
        ? (clip.properties?.opacity ?? 100)
        : (clip.properties.opacity ?? 100);
      return `Opacity ${opacity}%`;
    }
    case "scale":
      return !isTextClip(clip) ? `Scale ${clip.properties.scale ?? 1}x` : "—";
    case "position": {
      const pos = isTextClip(clip)
        ? (clip.properties?.position ?? { x: 0, y: 0 })
        : (clip.properties.position ?? { x: 0, y: 0 });
      return `x ${pos.x}, y ${pos.y}`;
    }
    case "text-content":
      return isTextClip(clip) ? `"${clip.textContent}"` : "—";
    case "text-style":
      return isTextClip(clip)
        ? `${clip.textStyle.font}, ${clip.textStyle.size}px`
        : "—";
    case "timeline-offset":
      return `at ${formatTimecode(clip.timelineRange.start)}`;
    case "source-offset":
      return !isTextClip(clip) ? `src ${formatTimecode(clip.sourceRange.start)}` : "—";
    default:
      return `${formatTimecode(clip.timelineRange.start)} · ${clip.timelineRange.duration.value}f`;
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--fb-text-mute)", textAlign: "center", padding: 20 }}>
      {children}
    </div>
  );
}
