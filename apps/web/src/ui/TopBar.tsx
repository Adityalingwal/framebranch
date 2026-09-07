"use client";

import { useState } from "react";
import { GitBranch } from "@phosphor-icons/react";

import { showToast } from "../lib/state/toast-status";
import { useConnectionStatus } from "../lib/state/connection-status";
import {
  useCreateBranchMutation,
  useSaveVersionMutation,
  useSwitchBranchMutation,
} from "../lib/data/hooks";
import { BranchControl } from "./BranchControl";
import { primaryButton, textInput } from "./styles";

export function TopBar({
  currentBranch,
  knownBranches,
  pendingCount,
  onBranchChanged,
  onBranchAdded,
  onChangesClick,
}: {
  currentBranch: string;
  knownBranches: string[];
  pendingCount: number;
  onBranchChanged: (branch: string) => void;
  onBranchAdded: (branch: string) => void;
  onChangesClick: () => void;
}) {
  const [versionName, setVersionName] = useState("");
  const editingPaused = useConnectionStatus().lost;

  const saveVersion = useSaveVersionMutation(currentBranch);
  const createBranch = useCreateBranchMutation();
  const switchBranch = useSwitchBranchMutation();

  const busy =
    saveVersion.isPending || createBranch.isPending || switchBranch.isPending;

  return (
    <header className="chrome-blur topbar">
      <div className="topbar-left">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            paddingRight: 4,
            color: "var(--fb-text-body-2)",
          }}
        >
          <GitBranch
            size={15}
            weight="fill"
            aria-hidden
            style={{ opacity: 0.7 }}
          />
          <span
            className="topbar-wordmark"
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.1,
              whiteSpace: "nowrap",
            }}
          >
            FrameBranch
          </span>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-branch-pill">
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
        </div>

        <button
          type="button"
          aria-label="Open changes panel"
          onClick={onChangesClick}
          className={`topbar-changes-chip${pendingCount > 0 ? " has-changes" : ""}`}
        >
          {pendingCount > 0 ? (
            <>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--fb-warn)",
                  flexShrink: 0,
                }}
              />
              {pendingCount} {pendingCount === 1 ? "change" : "changes"}
            </>
          ) : (
            "No changes"
          )}
        </button>
      </div>

      <div className="topbar-version-cluster">
        <input
          className="topbar-version-input"
          style={{ ...textInput, width: undefined }}
          placeholder="Name this version…"
          value={versionName}
          disabled={editingPaused}
          aria-label="Version name"
          onChange={(event) => setVersionName(event.target.value)}
        />
        <button
          type="button"
          style={
            busy || editingPaused || versionName.trim().length === 0
              ? { ...primaryButton, opacity: 0.45 }
              : primaryButton
          }
          // C2: a Mark needs a name — the button stays off while it is empty
          // (the server refuses an empty one too, E_NAME_REQUIRED).
          disabled={busy || editingPaused || versionName.trim().length === 0}
          onClick={() =>
            saveVersion.mutate(versionName.trim(), {
              onSuccess: () => setVersionName(""),
            })
          }
        >
          Save version
        </button>
      </div>

      <div className="topbar-spacer" aria-hidden />
    </header>
  );
}
