"use client";

import { useState } from "react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { formatClock } from "../../lib/format";
import { useHistoryQuery } from "../../lib/data/hooks";

/**
 * B4-2 / C1 / B6 — the History list for one cut (B2: this cut's chain,
 * newest first, index 0 = the head).
 *
 * Every card is `icon + name (+ Current pill)` over one meta line; runs of
 * consecutive auto-saves collapse IN PLACE into `‹N› auto-saves ▸` at the
 * position where they happened. Names are written by the server (G4-N) and
 * rendered verbatim — the panel invents no text.
 *
 * Deliberately absent: a Restore button (#235 — Restore lives only on the
 * View bar, B1/B5-2b), a ⑂ badge (#234, B6), the import-warnings list
 * (#237, G1), and the old explanatory line (#68 — that promise belongs in
 * the Restore box, #91).
 */
export function HistoryPanel({
  currentBranch,
  head,
  headCardName,
  changesCount,
  viewingCommitId,
  onViewCard,
}: {
  currentBranch: string;
  /** This cut's head commit id (A1b), or null while it is unknown. */
  head: string | null;
  /** The head card's name — null while branch and History disagree. */
  headCardName: string | null;
  /** The one changes number (D2); undefined while the diff is in flight. */
  changesCount: number | undefined;
  viewingCommitId: string | null;
  onViewCard: (commit: HistoryCommit) => void;
}) {
  // B2: the current cut's chain only.
  const history = useHistoryQuery(currentBranch);

  if (history.isLoading) return <Empty>Loading history…</Empty>;
  if (history.isError)
    return <Empty>{"Couldn't load history."}</Empty>;

  const commits = history.data?.commits ?? [];
  if (commits.length === 0) return <Empty>No versions yet.</Empty>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* B4-2 / #70 — only when something has actually changed since the
          head card. Never the word "unsaved": under the auto-save model
          everything is saved, it just is not marked. */}
      {changesCount !== undefined && changesCount > 0 && headCardName && (
        <div className="history-now-line">
          <span className="history-now-dot" aria-hidden />
          {`Now · ${changesCount} ${
            changesCount === 1 ? "change" : "changes"
          } since "${headCardName}"`}
        </div>
      )}

      {groupRuns(commits, head).map((entry) =>
        entry.kind === "card" ? (
          <FullCard
            key={entry.commit.commitId}
            commit={entry.commit}
            isHead={entry.commit.commitId === head}
            isViewing={entry.commit.commitId === viewingCommitId}
            onView={() => onViewCard(entry.commit)}
          />
        ) : (
          <AutoFold
            key={`fold-${entry.commits[0].commitId}`}
            commits={entry.commits}
            viewingCommitId={viewingCommitId}
            onViewCard={onViewCard}
          />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping — auto cards fold IN PLACE (#78), except the head
// ---------------------------------------------------------------------------

type Entry =
  | { kind: "card"; commit: HistoryCommit }
  | { kind: "fold"; commits: HistoryCommit[] };

/**
 * A run of consecutive `auto` cards becomes one fold at its own position.
 * The one exception: an auto card that IS the head is a full card — it is
 * what the `Current` pill and the top bar's `· ‹card›` point at, and a
 * folded-away "you are here" would be a lie.
 */
export function groupRuns(
  commits: HistoryCommit[],
  head: string | null,
): Entry[] {
  const entries: Entry[] = [];
  let run: HistoryCommit[] = [];
  const flush = () => {
    if (run.length > 0) entries.push({ kind: "fold", commits: run });
    run = [];
  };
  for (const commit of commits) {
    if (commit.kind === "auto" && commit.commitId !== head) {
      run.push(commit);
      continue;
    }
    flush();
    entries.push({ kind: "card", commit });
  }
  flush();
  return entries;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** #83 / C1 — 👤 for a person, 🤖 for the agent, ○ for the seed. */
function iconFor(kind: HistoryCommit["kind"]): string {
  if (kind === "agent-run") return "🤖";
  if (kind === "seed") return "○";
  return "👤";
}

/**
 * #72 / #73 / #82 — the meta line, per kind:
 *   mark · agent-run · restore · import → `‹who› · ‹N› changes · ‹time›`
 *   bring-in                            → `‹time› · ‹N› changes` (no who, B6)
 *   seed                                → `Start · ‹time›`
 */
function metaFor(commit: HistoryCommit): string {
  const time = formatClock(commit.createdAt);
  if (commit.kind === "seed") return `Start · ${time}`;
  // D1: a card whose content matched its parent reads `No changes`, the
  // same words the chip uses for the same fact.
  const changes =
    commit.changes === 0
      ? "No changes"
      : `${commit.changes} ${commit.changes === 1 ? "change" : "changes"}`;
  if (commit.kind === "bring-in") return `${time} · ${changes}`;
  const who = commit.actorName ?? "";
  return who ? `${who} · ${changes} · ${time}` : `${changes} · ${time}`;
}

function FullCard({
  commit,
  isHead,
  isViewing,
  onView,
}: {
  commit: HistoryCommit;
  isHead: boolean;
  isViewing: boolean;
  onView: () => void;
}) {
  return (
    <button
      type="button"
      className={`history-card${isHead ? " is-current" : ""}${isViewing ? " is-viewing" : ""}`}
      aria-label={`View "${commit.name}"`}
      title={`View "${commit.name}"`}
      onClick={onView}
    >
      <span className="history-card-row1">
        <span className="history-card-icon" aria-hidden>
          {iconFor(commit.kind)}
        </span>
        <span className="history-card-name">{commit.name}</span>
        {isHead && <span className="history-card-pill">Current</span>}
      </span>
      <span className="history-card-meta">{metaFor(commit)}</span>
    </button>
  );
}

/** #78 / #74 — the in-place fold and its compact auto cards. */
function AutoFold({
  commits,
  viewingCommitId,
  onViewCard,
}: {
  commits: HistoryCommit[];
  viewingCommitId: string | null;
  onViewCard: (commit: HistoryCommit) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`history-fold${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="history-fold-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="history-fold-chevron" aria-hidden>
          ▸
        </span>
        {commits.length} {commits.length === 1 ? "auto-save" : "auto-saves"}
      </button>
      {open && (
        <div className="history-fold-items">
          {commits.map((commit) => (
            <button
              key={commit.commitId}
              type="button"
              className={`history-auto-card${commit.commitId === viewingCommitId ? " is-viewing" : ""}`}
              aria-label={`View "${commit.name}"`}
              title={`View "${commit.name}"`}
              onClick={() => onViewCard(commit)}
            >
              <span className="history-auto-name">{commit.name}</span>
              <span className="history-auto-meta">
                {commit.actorName
                  ? `${commit.actorName} · ${formatClock(commit.createdAt)}`
                  : formatClock(commit.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
