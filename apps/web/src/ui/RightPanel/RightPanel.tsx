"use client";

import type { MergeChoice } from "@framebranch/engine";

import type { HistoryCommit } from "../../lib/data/api-client";
import type { BringInPreviewQuery, CompareQuery } from "../../lib/data/hooks";
import type { ConflictLine } from "../../server/conflict-cards";
import type { DiffRow } from "../../server/diff-rows";
import { BringInPanel } from "./BringInPanel";
import { ChangesPanel } from "./ChangesPanel";
import { HistoryPanel } from "./HistoryPanel";

export type PanelView = "changes" | "history";

const TABS: { id: PanelView; label: string }[] = [
  { id: "changes", label: "Changes" },
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
  // `editingLocked` stays in the props (the Shell passes it and B4's Agent
  // panel reads it) but no panel below consumes it since the Merge tab went.
  commits,
  comparePair,
  historyEmpty,
  onComparePairChange,
  compare,
  highlightedClipIds,
  onHighlightClip,
  onRowClick,
  onViewCard,
  bringIn,
  preview,
  landPending,
  landError,
  onChoice,
  onLand,
  onCancelBringIn,
  onStartAgain,
  onLineClick,
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
  /** B5-1 / B2 — View mode and Compare lock every write this panel offers. */
  editingLocked: boolean;
  /** B2 §2.4 — the Compare state lives in the Shell; this panel is a view. */
  commits: HistoryCommit[];
  comparePair: { a: string; b: string } | null;
  /** History has answered and holds no card (B2 #106 fallback gate). */
  historyEmpty: boolean;
  onComparePairChange: (pair: { a: string; b: string }) => void;
  compare: CompareQuery;
  highlightedClipIds: string[];
  onHighlightClip: (clipIds: string[]) => void;
  onRowClick: (row: DiffRow) => void;
  onViewCard: (commit: HistoryCommit) => void;
  /**
   * B3 §2.6 — the Bring-in preview is the Changes view's THIRD door: while a
   * cut is picked, this column is the Bring-in panel instead of the pickers
   * and rows. Every piece of its state lives in the Shell.
   */
  bringIn: { cut: string } | null;
  preview: BringInPreviewQuery;
  landPending: boolean;
  landError: unknown;
  onChoice: (conflictId: string, choice: MergeChoice) => void;
  onLand: () => void;
  onCancelBringIn: () => void;
  onStartAgain: () => void;
  onLineClick: (line: ConflictLine) => void;
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
      {/* C6 (#60-#62): the title is whichever view is open, the sub-line
          is the cut (B2 — the only cut label in History), and the control
          is a bare ✕. It still returns to the Inspector; the Agent panel
          that C6 wants behind it is B4's. */}
      <div className="version-panel-header">
        <div>
          <h2>{TABS.find((tab) => tab.id === view)?.label ?? "History"}</h2>
          <span>Cut: {currentBranch}</span>
        </div>
        {hasInspector && onCloseToInspector && (
          <button
            type="button"
            className="version-panel-close"
            aria-label="Close"
            onClick={onCloseToInspector}
          >
            ✕
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
        {view === "changes" && bringIn !== null && (
          <BringInPanel
            cut={bringIn.cut}
            preview={preview}
            landPending={landPending}
            landError={landError}
            onChoice={onChoice}
            onLand={onLand}
            onCancel={onCancelBringIn}
            onStartAgain={onStartAgain}
            highlightedClipIds={highlightedClipIds}
            onHighlightClip={onHighlightClip}
            onRowClick={onRowClick}
            onLineClick={onLineClick}
          />
        )}
        {view === "changes" && bringIn === null && (
          <ChangesPanel
            commits={commits}
            pair={comparePair}
            historyEmpty={historyEmpty}
            onPairChange={onComparePairChange}
            compare={compare}
            highlightedClipIds={highlightedClipIds}
            onHighlightClip={onHighlightClip}
            onRowClick={onRowClick}
          />
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
