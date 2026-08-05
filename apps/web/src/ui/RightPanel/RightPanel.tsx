"use client";

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
}: {
  view: PanelView;
  onViewChange: (view: PanelView) => void;
  currentBranch: string;
}) {
  return (
    <div
      className="surface-lg"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
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
            className="motion-hover"
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
        {view === "changes" && <ChangesPanel />}
        {view === "merge" && <MergePanel />}
        {view === "history" && <HistoryPanel currentBranch={currentBranch} />}
      </div>
    </div>
  );
}
