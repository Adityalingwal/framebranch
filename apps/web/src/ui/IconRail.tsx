"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  DownloadSimple,
  GitDiff,
  GitMerge,
  Keyboard,
  PushPinSimple,
  Robot,
  UploadSimple,
} from "@phosphor-icons/react";

import type { ImportWarning } from "@framebranch/engine";

import {
  useAgentSimulateMutation,
  useDemoResetMutation,
  useExportMutation,
  useImportMutation,
} from "../lib/data/hooks";
import { useConnectionStatus } from "../lib/state/connection-status";
import { showToast } from "../lib/state/toast-status";
import { ConfirmDialog } from "./ConfirmDialog";
import { ModalShell } from "./ModalShell";
import type { PanelView } from "./RightPanel/RightPanel";

const AGENT_BRANCH = "tighten-intro";
const AGENT_SCRIPT = "tighten-intro";
const COLLAPSE_DELAY_MS = 240;

function describeSkipped(items: ImportWarning[]): string {
  if (items.length === 0) return "Imported successfully.";
  const list = items
    .map((warning) => `${warning.count} ${warning.detail}`)
    .join(", ");
  return `Imported. Skipped: ${list} — these will not come back on export.`;
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function IconRail({
  view,
  versioningOpen,
  currentBranch,
  pendingCount,
  onViewChange,
  onBranchTouched,
  onDemoReset,
}: {
  view: PanelView;
  versioningOpen: boolean;
  currentBranch: string;
  pendingCount: number;
  onViewChange: (view: PanelView) => void;
  onBranchTouched: (branch: string) => void;
  onDemoReset: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const editingPaused = useConnectionStatus().lost;
  const importMutation = useImportMutation();
  const exportMutation = useExportMutation();
  const agentSimulate = useAgentSimulateMutation();
  const demoReset = useDemoResetMutation();

  const expanded = pinned || hovered || focusWithin;

  useEffect(() => {
    const openImport = () => importInputRef.current?.click();
    window.addEventListener("framebranch:open-import", openImport);
    return () =>
      window.removeEventListener("framebranch:open-import", openImport);
  }, []);

  function clearCollapseTimer() {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }

  function openRail() {
    clearCollapseTimer();
    setHovered(true);
  }

  function scheduleCollapse() {
    clearCollapseTimer();
    collapseTimer.current = setTimeout(() => {
      setHovered(false);
      setFocusWithin(false);
    }, COLLAPSE_DELAY_MS);
  }

  function handleImportFile(file: File) {
    file
      .text()
      .then((text) => {
        let otioJson: unknown;
        try {
          otioJson = JSON.parse(text);
        } catch {
          showToast("That file isn't valid JSON.", "error");
          return;
        }
        importMutation.mutate(
          { branch: currentBranch, otioJson },
          {
            onSuccess: (data) => showToast(describeSkipped(data.skippedItems)),
          },
        );
      })
      .catch(() => showToast("Couldn't read that file.", "error"));
  }

  return (
    <div className={`rail-shell${pinned ? " is-pinned" : ""}`}>
      <aside
        aria-label="Workspace navigation"
        className={`workspace-rail${expanded ? " is-expanded" : ""}${pinned ? " is-pinned" : ""}`}
        onMouseEnter={openRail}
        onMouseLeave={scheduleCollapse}
        onFocusCapture={() => {
          clearCollapseTimer();
          setFocusWithin(true);
        }}
        onBlurCapture={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            scheduleCollapse();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (pinned) setPinned(false);
          setHovered(false);
          setFocusWithin(false);
        }}
      >
        <div className="rail-header">
          <span className="rail-header-label">Workspace</span>
          <button
            type="button"
            className="rail-pin-button"
            aria-label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
            aria-pressed={pinned}
            title={pinned ? "Unpin sidebar" : "Keep sidebar open"}
            onClick={() => setPinned((current) => !current)}
          >
            <PushPinSimple
              size={15}
              weight={pinned ? "fill" : "regular"}
              aria-hidden
            />
          </button>
        </div>

        <nav className="rail-navigation" aria-label="Editor sections">
          <RailSectionLabel>Versioning</RailSectionLabel>
          <RailButton
            label="Changes"
            active={versioningOpen && view === "changes"}
            badge={pendingCount > 0 ? String(pendingCount) : undefined}
            icon={<GitDiff size={18} weight="duotone" aria-hidden />}
            onClick={() => onViewChange("changes")}
          />
          <RailButton
            label="Merge"
            active={versioningOpen && view === "merge"}
            icon={<GitMerge size={18} weight="duotone" aria-hidden />}
            onClick={() => onViewChange("merge")}
          />
          <RailButton
            label="History"
            active={versioningOpen && view === "history"}
            icon={
              <ClockCounterClockwise size={18} weight="duotone" aria-hidden />
            }
            onClick={() => onViewChange("history")}
          />

          <RailSectionLabel>Project</RailSectionLabel>
          <input
            ref={importInputRef}
            type="file"
            accept=".otio,application/json,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) handleImportFile(file);
            }}
          />
          <RailButton
            label={importMutation.isPending ? "Importing…" : "Import project"}
            disabled={importMutation.isPending || editingPaused}
            icon={<UploadSimple size={18} weight="duotone" aria-hidden />}
            onClick={() => importInputRef.current?.click()}
          />
          <RailButton
            label={exportMutation.isPending ? "Exporting…" : "Export project"}
            disabled={exportMutation.isPending || editingPaused}
            icon={<DownloadSimple size={18} weight="duotone" aria-hidden />}
            onClick={() =>
              exportMutation.mutate(currentBranch, {
                onSuccess: (data) => {
                  downloadJson(data.otioJson, `${data.name}.otio`);
                  showToast(`Exported "${data.name}".`);
                },
              })
            }
          />
          <RailButton
            label={
              agentSimulate.isPending
                ? "Agent running…"
                : "Simulate agent edits"
            }
            disabled={agentSimulate.isPending || editingPaused}
            icon={<Robot size={18} weight="duotone" aria-hidden />}
            onClick={() =>
              agentSimulate.mutate(
                { branch: AGENT_BRANCH, script: AGENT_SCRIPT },
                {
                  onSuccess: (data) => {
                    onBranchTouched(AGENT_BRANCH);
                    showToast(`Agent run complete — "${data.name}".`);
                  },
                },
              )
            }
          />
        </nav>

        <div className="rail-footer">
          <RailButton
            label="Editor controls"
            icon={<Keyboard size={18} weight="duotone" aria-hidden />}
            onClick={() => setShortcutsOpen(true)}
          />
          <RailButton
            label="Reset demo"
            danger
            disabled={editingPaused}
            icon={
              <ArrowCounterClockwise size={18} weight="duotone" aria-hidden />
            }
            onClick={() => setResetOpen(true)}
          />
        </div>
      </aside>

      <ModalShell
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title="Editor controls"
      >
        <div className="shortcut-list">
          <ShortcutRow
            keys="Click"
            action="Select a clip or place the playhead"
          />
          <ShortcutRow keys="Drag" action="Move a clip along its track" />
          <ShortcutRow
            keys="Drag edge"
            action="Trim the start or end of a clip"
          />
          <ShortcutRow
            keys="Alt + drag"
            action="Slip the source media inside a clip"
          />
          <ShortcutRow keys="Delete" action="Delete the selected clip" />
          <ShortcutRow
            keys="Esc"
            action="Close menus or collapse the sidebar"
          />
        </div>
      </ModalShell>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset demo?"
        description="This throws away everything in this session and starts over from the original demo project. This cannot be undone."
        confirmLabel="Reset demo"
        busy={demoReset.isPending}
        onConfirm={() =>
          demoReset.mutate(undefined, {
            onSuccess: () => {
              setResetOpen(false);
              onDemoReset();
              showToast("Demo reset.");
            },
          })
        }
      />
    </div>
  );
}

function RailSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="rail-section-label">{children}</div>;
}

function RailButton({
  label,
  icon,
  onClick,
  active = false,
  danger = false,
  disabled = false,
  badge,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`rail-item${active ? " is-active" : ""}${danger ? " is-danger" : ""}`}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
    >
      <span className="rail-item-icon">{icon}</span>
      <span className="rail-item-label">{label}</span>
      {badge && <span className="rail-item-badge">{badge}</span>}
    </button>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="shortcut-row">
      <kbd>{keys}</kbd>
      <span>{action}</span>
    </div>
  );
}
