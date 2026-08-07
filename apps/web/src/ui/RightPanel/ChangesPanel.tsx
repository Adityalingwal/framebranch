"use client";

import { useEffect, useState } from "react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { useHeadCommits } from "../../lib/state/head-tracking";
import { useDiffQuery, useHistoryQuery } from "../../lib/data/hooks";
import { relativeTime } from "../../lib/format";
import { textInput } from "../styles";

/**
 * §6 — Changes panel: pick two versions, `GET /api/diff`, render
 * `sentences` verbatim (C1 — never reworded/resorted/filtered here).
 *
 * Default pair = "this branch's head vs its parent" when known (see
 * head-tracking.ts for why "known" needs a caveat — no endpoint reports a
 * branch's head commit id, so this is client-side bookkeeping from mutation
 * responses, good for the live session, lost on a hard reload). Either
 * dropdown can always be changed by hand to ANY commit in the project's
 * history — that is what makes "main head vs tighten-intro head" (the demo
 * step) reachable even when the default guess is wrong or unknown, with no
 * server change required.
 */
export function ChangesPanel({
  currentBranch,
  pendingCount,
  onHighlightClip,
}: {
  currentBranch: string;
  pendingCount: number;
  onHighlightClip: (clipId: string | null) => void;
}) {
  const history = useHistoryQuery();
  const heads = useHeadCommits();

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [defaulted, setDefaulted] = useState(false);

  const commits = history.data?.commits ?? [];

  // Apply the default exactly once per branch, once history + a known head
  // are both available — after that the user's own picks are never
  // overwritten out from under them.
  useEffect(() => {
    setDefaulted(false);
    setFrom(null);
    setTo(null);
  }, [currentBranch]);

  useEffect(() => {
    if (defaulted || commits.length === 0) return;
    const head = heads[currentBranch];
    if (!head) return;
    const headCommit = commits.find((c) => c.commitId === head);
    if (!headCommit) return;
    const parent = headCommit.parents[0] ?? head; // root commit → vs itself
    setFrom(parent);
    setTo(head);
    setDefaulted(true);
  }, [defaulted, commits, heads, currentBranch]);

  const diff = useDiffQuery(from, to);

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <VersionPicker
          label="From"
          commits={commits}
          value={from}
          onChange={setFrom}
        />
        <VersionPicker
          label="To"
          commits={commits}
          value={to}
          onChange={setTo}
        />
      </div>

      {pendingCount > 0 && (
        <p
          style={{
            fontSize: 11,
            color: "var(--fb-text-mute)",
            margin: "0 0 12px",
            lineHeight: 1.4,
          }}
        >
          This branch has {pendingCount} unsaved{" "}
          {pendingCount === 1 ? "change" : "changes"} not shown here — diffs
          compare saved versions. Save a version first to include them.
        </p>
      )}

      {!from || !to ? (
        <Empty>Pick two versions to compare.</Empty>
      ) : diff.isLoading ? (
        <Empty>Loading…</Empty>
      ) : diff.isError ? (
        <Empty>Couldn&rsquo;t load this diff.</Empty>
      ) : diff.data && diff.data.sentences.length === 0 ? (
        <Empty>No changes.</Empty>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {diff.data?.sentences.map((sentence, i) => {
            const entry = diff.data!.entries[i];
            const clipId =
              entry && "clipId" in entry ? (entry.clipId ?? null) : null;
            return (
              <li
                key={i}
                onMouseEnter={() => clipId && onHighlightClip(clipId)}
                onMouseLeave={() => onHighlightClip(null)}
                onClick={() => clipId && onHighlightClip(clipId)}
                style={{
                  fontSize: 12,
                  color: "var(--fb-text-body)",
                  padding: "6px 8px",
                  borderRadius: "var(--fb-radius-sm)",
                  cursor: clipId ? "pointer" : "default",
                }}
                className={clipId ? "motion-hover" : undefined}
              >
                {sentence}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VersionPicker({
  label,
  commits,
  value,
  onChange,
}: {
  label: string;
  commits: HistoryCommit[];
  value: string | null;
  onChange: (commitId: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: "var(--fb-text-mute)",
      }}
    >
      <span style={{ width: 32, flexShrink: 0 }}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...textInput, width: "auto", flex: 1 }}
      >
        <option value="" disabled>
          Choose a version…
        </option>
        {commits.map((c) => (
          <option key={c.commitId} value={c.commitId}>
            {c.actor === "agent" ? "🤖" : "👤"} {c.name} —{" "}
            {relativeTime(c.createdAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--fb-text-mute)",
        textAlign: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
