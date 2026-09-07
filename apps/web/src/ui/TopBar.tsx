"use client";

import { useState } from "react";
import { GitBranch } from "@phosphor-icons/react";

import type { BranchListItem } from "../app/api/branch/route";
import { quoted } from "../lib/format";
import { showToast } from "../lib/state/toast-status";
import {
  useCreateBranchMutation,
  useSaveVersionMutation,
  useSwitchBranchMutation,
} from "../lib/data/hooks";
import { CutMenu } from "./CutMenu";
import { ModalShell } from "./ModalShell";
import { primaryButton, secondaryButton, textInput } from "./styles";

/**
 * A2 roop — the locked shape:
 *   `[Cut: main ▾] · ‹card›   [‹N› changes]   [Mark version]`
 *
 * `‹card›` is the name of the card carrying History's `Current` pill; the
 * chip is the real difference Now vs that card (D2 patch), the same number
 * the rail badge and the Now-line show. Both are handed down by Shell, from
 * `GET /api/branch` + `GET /api/history` + `GET /api/diff` — nothing about
 * "where am I" is remembered here.
 */
export function TopBar({
  currentBranch,
  cuts,
  headCardName,
  changesCount,
  editingLocked,
  onBranchChanged,
  onChangesClick,
}: {
  currentBranch: string;
  cuts: BranchListItem[];
  /** The head card's name, or null while the two queries are out of step. */
  headCardName: string | null;
  /** undefined = the diff has not answered yet: show the chip without a number. */
  changesCount: number | undefined;
  editingLocked: boolean;
  onBranchChanged: (branch: string) => void;
  onChangesClick: () => void;
}) {
  const [markOpen, setMarkOpen] = useState(false);
  const [versionName, setVersionName] = useState("");

  const saveVersion = useSaveVersionMutation(currentBranch);
  const createBranch = useCreateBranchMutation();
  const switchBranch = useSwitchBranchMutation();

  const busy =
    saveVersion.isPending || createBranch.isPending || switchBranch.isPending;

  // E1: nothing changed since the head card → marking again would write a
  // duplicate card. While the count is still unknown the button stays off
  // too: an enabled Mark there could send a clean commit, which the server
  // answers with the OLD head — and the toast would claim a version that
  // was never made.
  const nothingToMark = changesCount === undefined || changesCount === 0;
  const markDisabled = editingLocked || busy || nothingToMark;
  // The explanation is only true when the count is KNOWN to be 0; while
  // the diff is still in flight the button is off but says nothing.
  const markTitle =
    changesCount === 0 && !editingLocked && headCardName
      ? `No changes since ${quoted(headCardName)}`
      : undefined;

  const trimmedName = versionName.trim();

  function submitMark() {
    const name = versionName.trim();
    if (!name) return;
    saveVersion.mutate(name, {
      onSuccess: () => {
        setMarkOpen(false);
        setVersionName("");
        showToast(`Marked "${name}".`);
      },
    });
  }

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

        <div className="topbar-cut-cluster">
          <CutMenu
            current={currentBranch}
            cuts={cuts}
            disabled={editingLocked}
            busy={busy}
            onSwitch={(to) => {
              switchBranch.mutate(
                { from: currentBranch, to },
                { onSuccess: () => onBranchChanged(to) },
              );
            }}
            onCreate={(name) => {
              createBranch.mutate(
                { name, from: currentBranch },
                { onSuccess: (data) => onBranchChanged(data.name) },
              );
            }}
          />
          {/* A2 (#16) — the head card's name, plain text. Nothing at all
              while the branch and History queries disagree: a name here is
              a claim about "you are here", and a stale one is a lie. */}
          {headCardName && (
            <span className="topbar-current-card" title={headCardName}>
              · {headCardName}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label="Open Changes"
          onClick={onChangesClick}
          className={`topbar-changes-chip${changesCount ? " has-changes" : ""}`}
        >
          {changesCount === undefined ? (
            // #17 has no loading string: keep the chip's footprint, show
            // no text until the count is known (never a momentary
            // `No changes`).
            <span aria-hidden style={{ display: "inline-block", width: 58 }} />
          ) : changesCount > 0 ? (
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
              {changesCount} {changesCount === 1 ? "change" : "changes"}
            </>
          ) : (
            "No changes"
          )}
        </button>
      </div>

      <div className="topbar-version-cluster">
        {/* A disabled <button> does not fire hover events in every browser,
            so E1's explanation (#27) hangs on the wrapper. */}
        <span title={markTitle}>
          <button
            type="button"
            style={
              markDisabled
                ? { ...primaryButton, opacity: 0.45, cursor: "not-allowed" }
                : primaryButton
            }
            disabled={markDisabled}
            onClick={() => {
              setVersionName("");
              setMarkOpen(true);
            }}
          >
            Mark version
          </button>
        </span>
      </div>

      <div className="topbar-spacer" aria-hidden />

      <ModalShell
        open={markOpen}
        onOpenChange={setMarkOpen}
        title="Mark version"
      >
        <input
          autoFocus
          style={textInput}
          placeholder="Name this version…"
          aria-label="Version name"
          value={versionName}
          onChange={(event) => setVersionName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && trimmedName && !saveVersion.isPending) {
              submitMark();
            }
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            type="button"
            style={secondaryButton}
            onClick={() => setMarkOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            style={
              trimmedName && !saveVersion.isPending
                ? primaryButton
                : { ...primaryButton, opacity: 0.45, cursor: "not-allowed" }
            }
            // C2: a Mark needs a name — the button stays off while it is
            // empty (the server refuses an empty one too, E_NAME_REQUIRED).
            disabled={!trimmedName || saveVersion.isPending}
            onClick={submitMark}
          >
            Mark
          </button>
        </div>
      </ModalShell>
    </header>
  );
}
