"use client";

import { useEffect, useState } from "react";
import { Robot, User } from "@phosphor-icons/react";

import type { HistoryCommit } from "../../lib/data/api-client";
import {
  useBranchesQuery,
  useDiffQuery,
  useHistoryQuery,
} from "../../lib/data/hooks";
import { relativeTime } from "../../lib/format";
import { CustomSelect } from "../CustomSelect";

/**
 * §6 — Changes panel: pick two versions, `GET /api/diff`, render the shared
 * presenter's rows one per line (D4(1); the server orders older → newer, so
 * whichever way the pickers are set the reading is the same).
 *
 * The default pair = "this cut's head vs its parent". The head comes from
 * `GET /api/branch` (A1b — the one source; no client-side bookkeeping), the
 * parent from the cut's History (B2). B2 rewrites this panel into the
 * Compare view (Now as a side, lanes); B0 only moves it onto the new APIs.
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
  const history = useHistoryQuery(currentBranch);
  const branches = useBranchesQuery();

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [defaulted, setDefaulted] = useState(false);

  const commits = history.data?.commits ?? [];
  const head = branches.data?.branches.find(
    (b) => b.name === currentBranch,
  )?.head;

  // Apply the default exactly once per cut, once History + the head are
  // both known — after that the user's own picks are never overwritten.
  useEffect(() => {
    setDefaulted(false);
    setFrom(null);
    setTo(null);
  }, [currentBranch]);

  useEffect(() => {
    if (defaulted || commits.length === 0 || !head) return;
    const headCommit = commits.find((c) => c.commitId === head);
    if (!headCommit) return;
    const parent = headCommit.parents[0] ?? head; // root card → vs itself
    setFrom(parent);
    setTo(head);
    setDefaulted(true);
  }, [defaulted, commits, head]);

  const diff = useDiffQuery(currentBranch, from, to);

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
      ) : diff.data && diff.data.count === 0 ? (
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
          {diff.data?.rows.map((row) => {
            const clipId = row.clipIds[0] ?? null;
            return (
              <li
                key={row.key}
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
                {row.clipName} · {row.text}
                {row.where ? ` · ${row.where}` : ""}
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
      <CustomSelect
        value={value ?? ""}
        placeholder="Choose a version…"
        ariaLabel={`${label} version`}
        className="panel-select"
        options={commits.map((commit) => ({
          value: commit.commitId,
          label: commit.name,
          description: relativeTime(commit.createdAt),
          icon:
            commit.actor === "agent" ? (
              <Robot size={15} weight="duotone" aria-hidden />
            ) : (
              <User size={15} weight="duotone" aria-hidden />
            ),
        }))}
        onChange={onChange}
      />
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
