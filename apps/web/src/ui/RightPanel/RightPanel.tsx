"use client";

import type { MergeChoice } from "@framebranch/engine";

import type { HistoryCommit } from "../../lib/data/api-client";
import type { AgentRun } from "../../lib/data/api-client";
import type {
  AgentPresetsQuery,
  BringInPreviewQuery,
  CompareQuery,
} from "../../lib/data/hooks";
import type { ConflictLine } from "../../server/conflict-cards";
import type { DiffRow } from "../../server/diff-rows";
import { AgentPanel } from "./AgentPanel";
import { BringInPanel } from "./BringInPanel";
import { ChangesPanel } from "./ChangesPanel";
import { HistoryPanel } from "./HistoryPanel";

/**
 * C6 — `agent` is the DEFAULT view: the Agent panel is what the right
 * column shows when nothing else is open, and it has no rail button of its
 * own ("one place, one time").
 */
export type PanelView = "agent" | "changes" | "history";

/** Copy #60 — the header title is the open view's name. */
const VIEW_TITLE: Record<PanelView, string> = {
  agent: "Agent",
  changes: "Changes",
  history: "History",
};

/** §6 — the right panel's view IS the `?view=` param (M8 lock 2). */
export function RightPanel({
  view,
  onViewChange,
  currentBranch,
  head,
  headCardName,
  changesCount,
  viewingCommitId,
  // I1 — the Agent panel is finally the consumer this prop was kept for:
  // Run / View / Bring into main all write or switch cuts, so View mode,
  // Compare and a lost connection turn every one of them off.
  editingLocked,
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
  agentPresets,
  runPending,
  onRunPreset,
  onViewRun,
  onBringRunIntoMain,
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
  /** I1 — presets + their derived run state, handed down like History. */
  agentPresets: AgentPresetsQuery;
  /** I1(5) — the preset whose run is in flight; every Run is off meanwhile. */
  runPending: string | null;
  onRunPreset: (presetId: string) => void;
  onViewRun: (run: AgentRun) => void;
  onBringRunIntoMain: (run: AgentRun) => void;
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
          is a bare ✕ that returns to Agent. Agent is the default, so it
          carries no control at all — there is nothing to close it to. */}
      <div className="version-panel-header">
        <div>
          <h2>{VIEW_TITLE[view]}</h2>
          <span>Cut: {currentBranch}</span>
        </div>
        {view !== "agent" && (
          <button
            type="button"
            className="version-panel-close"
            aria-label="Close"
            onClick={() => onViewChange("agent")}
          >
            ✕
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
        {view === "agent" && (
          <AgentPanel
            presets={agentPresets}
            runPending={runPending}
            editingLocked={editingLocked}
            onRun={onRunPreset}
            onView={onViewRun}
            onBringIntoMain={onBringRunIntoMain}
          />
        )}
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
