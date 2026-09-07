"use client";

import { useEffect, useState } from "react";
import { Robot, User } from "@phosphor-icons/react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { NOW_SIDE } from "../../lib/data/api-client";
import { useDiffQuery, useHistoryQuery } from "../../lib/data/hooks";
import { formatClock } from "../../lib/format";
import { CustomSelect } from "../CustomSelect";

/**
 * §6 — Changes panel: pick two points, `GET /api/diff`, render the shared
 * presenter's rows one per line (D4(1); the server orders older → newer, so
 * whichever way the pickers are set the reading is the same).
 *
 * D2/D3: `Now` — the working timeline — is a side like any card, and the
 * DEFAULT pair is `head → Now`, which is exactly what the top-bar chip
 * counts, so the chip and this panel can never tell different stories.
 * B2 rewrites the inside of this panel (lanes, row redesign, summary
 * line); B1 only gives it `Now`, the default, and the Compare preselect.
 */
export function ChangesPanel({
  currentBranch,
  head,
  preselect,
  onPreselectConsumed,
  onHighlightClip,
}: {
  currentBranch: string;
  /** This cut's head commit id (A1b), or null while it is unknown. */
  head: string | null;
  /** B5 IMPL-NOTE (d) — the pair the View bar's Compare button asks for. */
  preselect: { from: string; to: string } | null;
  onPreselectConsumed: () => void;
  onHighlightClip: (clipId: string | null) => void;
}) {
  const history = useHistoryQuery(currentBranch);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [defaulted, setDefaulted] = useState(false);

  const commits = history.data?.commits ?? [];

  // Switching cuts throws the pair away — a commit id means nothing on
  // another cut's chain.
  useEffect(() => {
    setDefaulted(false);
    setFrom(null);
    setTo(null);
  }, [currentBranch]);

  // Compare wins over the default: it is an explicit request, and it may
  // arrive before or after the default would have applied.
  useEffect(() => {
    if (!preselect) return;
    setFrom(preselect.from);
    setTo(preselect.to);
    setDefaulted(true);
    onPreselectConsumed();
  }, [preselect, onPreselectConsumed]);

  // D3a — the default pair, applied once per cut: `head → Now`. After
  // that the user's own picks are never overwritten.
  //
  // `preselect` is checked here as well as above because on the render
  // that mounts this panel BOTH effects run before either `setState` is
  // visible: `defaulted` is still false in this closure, so without the
  // guard the default would land on top of the pair Compare just asked
  // for.
  useEffect(() => {
    if (preselect || defaulted || !head) return;
    setFrom(head);
    setTo(NOW_SIDE);
    setDefaulted(true);
  }, [preselect, defaulted, head]);

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
        options={[
          // D3b — the picker list is History's list with `Now` on top.
          { value: NOW_SIDE, label: "Now" },
          ...commits.map((commit) => ({
            value: commit.commitId,
            label: commit.name,
            description: formatClock(commit.createdAt),
            // `actor` is gone from the History item (B1); the badge is the
            // card KIND now — only an agent run gets the robot.
            icon:
              commit.kind === "agent-run" ? (
                <Robot size={15} weight="duotone" aria-hidden />
              ) : (
                <User size={15} weight="duotone" aria-hidden />
              ),
          })),
        ]}
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
