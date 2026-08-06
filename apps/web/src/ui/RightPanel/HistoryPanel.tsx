"use client";

import type { HistoryCommit } from "../../lib/data/api-client";
import { useConnectionStatus } from "../../lib/state/connection-status";
import { relativeTime } from "../../lib/format";
import { showToast } from "../../lib/state/toast-status";
import { useHistoryQuery, useRestoreMutation } from "../../lib/data/hooks";
import { secondaryButton } from "../styles";

/**
 * §8.3 — versions newest first, 👤/🤖 badges from `actor`, itemized import
 * warnings (F7 — survives a refresh because they live on the commit row),
 * Restore, and a merge marker for two-parent commits.
 */
export function HistoryPanel({ currentBranch }: { currentBranch: string }) {
  const history = useHistoryQuery();
  const restore = useRestoreMutation(currentBranch);
  const editingPaused = useConnectionStatus().lost;

  if (history.isLoading) {
    return <Empty>Loading history…</Empty>;
  }
  if (history.isError) {
    return <Empty>Couldn&rsquo;t load history.</Empty>;
  }

  const commits = history.data?.commits ?? [];
  if (commits.length === 0) {
    return <Empty>No versions yet.</Empty>;
  }

  return (
    <div>
      <p
        style={{
          fontSize: 11,
          color: "var(--fb-text-mute)",
          margin: 0,
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >
        Restoring a version creates a new version — it never rewrites
        history.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {commits.map((commit) => (
          <CommitRow
            key={commit.commitId}
            commit={commit}
            disabled={editingPaused || restore.isPending}
            onRestore={() =>
              restore.mutate(commit.commitId, {
                onSuccess: () => showToast(`Restored "${commit.name}".`),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function CommitRow({
  commit,
  disabled,
  onRestore,
}: {
  commit: HistoryCommit;
  disabled: boolean;
  onRestore: () => void;
}) {
  const isMerge = commit.parents.length > 1;

  return (
    <div className="surface" style={{ padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span title={commit.actor === "agent" ? "Agent" : "You"} aria-hidden>
          {commit.actor === "agent" ? "🤖" : "👤"}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--fb-text-body-2)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {commit.name}
        </span>
        {isMerge && (
          <span
            style={{
              fontSize: 10,
              color: "var(--fb-good)",
              background: "rgba(63,207,142,.12)",
              borderRadius: "var(--fb-radius-pill)",
              padding: "2px 8px",
            }}
          >
            ⑂ merge
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--fb-text-mute)",
          marginTop: 4,
        }}
      >
        {relativeTime(commit.createdAt)}
      </div>

      {commit.importWarnings && commit.importWarnings.length > 0 && (
        <ul
          style={{
            margin: "8px 0 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {commit.importWarnings.map((w, i) => (
            <li
              key={i}
              style={{ fontSize: 10.5, color: "var(--fb-warn)" }}
            >
              Skipped: {w.count} {w.detail}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          style={{
            ...secondaryButton,
            padding: "4px 12px",
            fontSize: 11,
            ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          disabled={disabled}
          onClick={onRestore}
        >
          Restore
        </button>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--fb-text-mute)", textAlign: "center", padding: 20 }}>
      {children}
    </div>
  );
}
