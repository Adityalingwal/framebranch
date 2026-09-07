"use client";

import { ArrowLeft } from "@phosphor-icons/react";

import type { HistoryCommit } from "../../lib/data/api-client";
import { ChangesPanel } from "./ChangesPanel";
import { HistoryPanel } from "./HistoryPanel";
import { MergePanel } from "./MergePanel";

export type PanelView = "changes" | "merge" | "history";

const TABS: { id: PanelView; label: string }[] = [
  { id: "changes", label: "Changes" },
  { id: "merge", label: "Merge" },
  { id: "history", label: "History" },
];

/** §6 — the right panel's tab IS the `?view=` param (M8 lock 2). */
export function RightPanel({
  view,
  onViewChange,
  currentBranch,
  head,
  headCardName,
  changesCount,
  viewingCommitId,
  comparePreselect,
  onComparePreselectConsumed,
  onHighlightClip,
  onViewCard,
  hasInspector,
  onCloseToInspector,
}: {
  view: PanelView;
  onViewChange: (view: PanelView) => void;
  currentBranch: string;
  head: string | null;
  headCardName: string | null;
  changesCount: number | undefined;
  viewingCommitId: string | null;
  comparePreselect: { from: string; to: string } | null;
  onComparePreselectConsumed: () => void;
  onHighlightClip: (clipId: string | null) => void;
  onViewCard: (commit: HistoryCommit) => void;
  hasInspector?: boolean;
  onCloseToInspector?: () => void;
}) {
  return (
    <div
      className="surface-lg"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div className="version-panel-header">
        <div>
          <h2>Version control</h2>
          <span>{currentBranch}</span>
        </div>
        {hasInspector && onCloseToInspector && (
          <button
            type="button"
            className="version-panel-back"
            onClick={onCloseToInspector}
          >
            <ArrowLeft size={14} weight="bold" aria-hidden />
            Inspector
          </button>
        )}
      </div>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          padding: 8,
          borderBottom: "1px solid rgba(255,255,255,.05)",
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => onViewChange(tab.id)}
            className="motion-hover right-panel-tab"
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: "var(--fb-radius-sm)",
              border: "none",
              cursor: "pointer",
              color:
                view === tab.id
                  ? "var(--fb-text-body-2)"
                  : "var(--fb-text-mute)",
              background: view === tab.id ? "var(--fb-panel-2)" : "transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
        {view === "changes" && (
          <ChangesPanel
            currentBranch={currentBranch}
            head={head}
            preselect={comparePreselect}
            onPreselectConsumed={onComparePreselectConsumed}
            onHighlightClip={onHighlightClip}
          />
        )}
        {view === "merge" && (
          <MergePanel currentBranch={currentBranch} />
        )}
        {view === "history" && (
          <HistoryPanel
            currentBranch={currentBranch}
            head={head}
            headCardName={headCardName}
            changesCount={changesCount}
            viewingCommitId={viewingCommitId}
            onViewCard={onViewCard}
          />
        )}
      </div>
    </div>
  );
}
