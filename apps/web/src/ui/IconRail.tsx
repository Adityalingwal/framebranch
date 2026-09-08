"use client";

/**
 * IconRail.tsx — the left rail (C6, copy #50-#59).
 *
 * C6: three items, no section headings — **Changes · History · Export**.
 * Merge left with its panel (B3), Import left the product (G1), and the
 * agent has NO rail button: the Agent panel is the right panel's default,
 * and "one place, one time" was the lock. The footer is Editor controls +
 * `New project…`, which replaced `Reset demo`.
 *
 * Clicking Changes or History puts that view in the RIGHT panel; the panel
 * is what shows content, this is only navigation.
 */

import { useEffect, useRef, useState } from "react";
import {
  ClockCounterClockwise,
  DownloadSimple,
  GitDiff,
  Keyboard,
  Plus,
  PushPinSimple,
} from "@phosphor-icons/react";

import { useExportMutation } from "../lib/data/hooks";
import { useConnectionStatus } from "../lib/state/connection-status";
import { showToast } from "../lib/state/toast-status";
import { ModalShell } from "./ModalShell";
import { NewProjectDialog } from "./NewProjectDialog";
import type { PanelView } from "./RightPanel/RightPanel";

const COLLAPSE_DELAY_MS = 240;

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
  changesCount,
  editingLocked,
  onViewChange,
  onNewProject,
}: {
  view: PanelView;
  versioningOpen: boolean;
  currentBranch: string;
  /**
   * D2 patch — the SAME number the top-bar chip shows (real difference Now
   * vs the head card), handed down by Shell so the two can never disagree.
   * `undefined` while that diff has not answered yet: no badge, never a 0.
   */
  changesCount: number | undefined;
  /**
   * B5-1 — Shell's one derived lock (connection lost OR a card is being
   * viewed OR Compare is open). Export and New project both write, so in
   * View mode they must be off like every other write path.
   */
  editingLocked: boolean;
  onViewChange: (view: PanelView) => void;
  /** G1 — Shell's reset after the picker seeds a new project. */
  onNewProject: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editingPaused = useConnectionStatus().lost || editingLocked;
  const exportMutation = useExportMutation();

  const expanded = pinned || hovered || focusWithin;

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

  useEffect(() => clearCollapseTimer, []);

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

        {/* C6 / #52: three items need no headings. #53/#54/#55. */}
        <nav className="rail-navigation" aria-label="Editor sections">
          <RailButton
            label="Changes"
            active={versioningOpen && view === "changes"}
            badge={
              changesCount !== undefined && changesCount > 0
                ? String(changesCount)
                : undefined
            }
            icon={<GitDiff size={18} weight="duotone" aria-hidden />}
            onClick={() => onViewChange("changes")}
          />
          <RailButton
            label="History"
            active={versioningOpen && view === "history"}
            icon={
              <ClockCounterClockwise size={18} weight="duotone" aria-hidden />
            }
            onClick={() => onViewChange("history")}
          />
          <RailButton
            label={exportMutation.isPending ? "Exporting…" : "Export"}
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
        </nav>

        <div className="rail-footer">
          <RailButton
            label="Editor controls"
            icon={<Keyboard size={18} weight="duotone" aria-hidden />}
            onClick={() => setShortcutsOpen(true)}
          />
          {/* #43 — replaces `Reset demo` (#59): the picker's first row IS
              the default demo, so a separate reset has nothing to add. */}
          <RailButton
            label="New project…"
            disabled={editingPaused}
            icon={<Plus size={18} weight="duotone" aria-hidden />}
            onClick={() => setNewProjectOpen(true)}
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

      <NewProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        onStarted={onNewProject}
      />
    </div>
  );
}

function RailButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  badge,
  title,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`rail-item${active ? " is-active" : ""}`}
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
