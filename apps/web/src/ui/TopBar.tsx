"use client";

import { useState } from "react";

import { showToast } from "../lib/toast-status";
import { BranchControl } from "./BranchControl";
import { ConfirmDialog } from "./ConfirmDialog";
import { chip, primaryButton, secondaryButton, textInput } from "./styles";
import { useConnectionStatus } from "../lib/connection-status";
import {
  useCreateBranchMutation,
  useDemoResetMutation,
  useSaveVersionMutation,
  useSwitchBranchMutation,
} from "../lib/hooks";

export function TopBar({
  currentBranch,
  knownBranches,
  pendingCount,
  onBranchChanged,
  onBranchAdded,
  onDemoReset,
}: {
  currentBranch: string;
  knownBranches: string[];
  pendingCount: number;
  onBranchChanged: (branch: string) => void;
  onBranchAdded: (branch: string) => void;
  onDemoReset: () => void;
}) {
  const [versionName, setVersionName] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  const editingPaused = useConnectionStatus().lost;

  const saveVersion = useSaveVersionMutation(currentBranch);
  const createBranch = useCreateBranchMutation();
  const switchBranch = useSwitchBranchMutation();
  const demoReset = useDemoResetMutation();

  const busy =
    saveVersion.isPending ||
    createBranch.isPending ||
    switchBranch.isPending ||
    demoReset.isPending;

  return (
    <header
      className="chrome-blur"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,.05)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fb-text-body-2)",
          letterSpacing: 0.2,
        }}
      >
        FrameBranch
      </span>

      <BranchControl
        current={currentBranch}
        known={knownBranches}
        disabled={editingPaused}
        busy={busy}
        onSwitch={(to) => {
          switchBranch.mutate(
            { from: currentBranch, to },
            {
              onSuccess: (data) => {
                onBranchChanged(to);
                if (data.sealedCommitId) {
                  showToast(
                    `Your unsaved changes on "${currentBranch}" were saved as a version first.`,
                  );
                }
              },
            },
          );
        }}
        onCreate={(name) => {
          createBranch.mutate(
            { name, from: currentBranch },
            {
              onSuccess: (data) => {
                onBranchAdded(data.name);
                onBranchChanged(data.name);
                if (data.sealedCommitId) {
                  showToast(
                    `Your unsaved changes on "${currentBranch}" were saved as a version first.`,
                  );
                }
              },
            },
          );
        }}
      />

      <span style={chip}>
        {pendingCount} {pendingCount === 1 ? "change" : "changes"}
      </span>

      <input
        style={{ ...textInput, width: 180 }}
        placeholder="Name this version (optional)"
        value={versionName}
        disabled={editingPaused}
        onChange={(e) => setVersionName(e.target.value)}
      />
      <button
        type="button"
        style={busy || editingPaused ? { ...primaryButton, opacity: 0.5 } : primaryButton}
        disabled={busy || editingPaused}
        onClick={() =>
          saveVersion.mutate(versionName.trim() || undefined, {
            onSuccess: () => setVersionName(""),
          })
        }
      >
        Save version
      </button>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        style={editingPaused ? { ...secondaryButton, opacity: 0.5 } : secondaryButton}
        disabled={editingPaused}
        onClick={() => setResetOpen(true)}
      >
        Reset demo
      </button>

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
    </header>
  );
}
