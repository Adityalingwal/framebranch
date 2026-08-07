"use client";

import { useRef, useState } from "react";

import type { ImportWarning } from "@framebranch/engine";

import { showToast } from "../lib/state/toast-status";
import { BranchControl } from "./BranchControl";
import { ConfirmDialog } from "./ConfirmDialog";
import { chip, primaryButton, secondaryButton, textInput } from "./styles";
import { useConnectionStatus } from "../lib/state/connection-status";
import {
  useAgentSimulateMutation,
  useCreateBranchMutation,
  useDemoResetMutation,
  useExportMutation,
  useImportMutation,
  useSaveVersionMutation,
  useSwitchBranchMutation,
} from "../lib/data/hooks";

/** §8 locked example format: "Skipped: 2 transitions, 1 blur — ...". */
function describeSkipped(items: ImportWarning[]): string {
  if (items.length === 0) return "Imported successfully.";
  const list = items.map((w) => `${w.count} ${w.detail}`).join(", ");
  return `Imported. Skipped: ${list} — these will not come back on export.`;
}

/** Client-side save-as-file — no network involved, the user's own export. */
function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** C8's only script — always this exact branch+script pair (§8). */
const AGENT_BRANCH = "tighten-intro";
const AGENT_SCRIPT = "tighten-intro";

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
  const importInputRef = useRef<HTMLInputElement>(null);

  const editingPaused = useConnectionStatus().lost;

  const saveVersion = useSaveVersionMutation(currentBranch);
  const createBranch = useCreateBranchMutation();
  const switchBranch = useSwitchBranchMutation();
  const demoReset = useDemoResetMutation();
  const agentSimulate = useAgentSimulateMutation();
  const importMutation = useImportMutation();
  const exportMutation = useExportMutation();

  const busy =
    saveVersion.isPending ||
    createBranch.isPending ||
    switchBranch.isPending ||
    demoReset.isPending;

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
        style={
          busy || editingPaused
            ? { ...primaryButton, opacity: 0.5 }
            : primaryButton
        }
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
        style={
          agentSimulate.isPending || editingPaused
            ? { ...secondaryButton, opacity: 0.5 }
            : secondaryButton
        }
        disabled={agentSimulate.isPending || editingPaused}
        title={`Runs the "${AGENT_SCRIPT}" script on branch "${AGENT_BRANCH}"`}
        onClick={() =>
          agentSimulate.mutate(
            { branch: AGENT_BRANCH, script: AGENT_SCRIPT },
            {
              onSuccess: (data) => {
                onBranchAdded(AGENT_BRANCH);
                showToast(`Agent run complete — "${data.name}".`);
              },
            },
          )
        }
      >
        {agentSimulate.isPending ? "Agent running…" : "Simulate agent edits"}
      </button>

      <input
        ref={importInputRef}
        type="file"
        accept=".otio,application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-selecting the same file next time
          if (file) handleImportFile(file);
        }}
      />
      <button
        type="button"
        style={
          importMutation.isPending || editingPaused
            ? { ...secondaryButton, opacity: 0.5 }
            : secondaryButton
        }
        disabled={importMutation.isPending || editingPaused}
        onClick={() => importInputRef.current?.click()}
      >
        {importMutation.isPending ? "Importing…" : "Import"}
      </button>

      <button
        type="button"
        style={
          exportMutation.isPending || editingPaused
            ? { ...secondaryButton, opacity: 0.5 }
            : secondaryButton
        }
        disabled={exportMutation.isPending || editingPaused}
        onClick={() =>
          exportMutation.mutate(currentBranch, {
            onSuccess: (data) => {
              downloadJson(data.otioJson, `${data.name}.otio`);
              showToast(`Exported "${data.name}".`);
            },
          })
        }
      >
        {exportMutation.isPending ? "Exporting…" : "Export"}
      </button>

      <button
        type="button"
        style={
          editingPaused ? { ...secondaryButton, opacity: 0.5 } : secondaryButton
        }
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
