"use client";

import { useState } from "react";
import { GitBranch } from "@phosphor-icons/react";

import type { BranchListItem } from "../app/api/branch/route";
import type { Peer } from "../lib/data/api-client";
import { quoted } from "../lib/format";
import { showToast } from "../lib/state/toast-status";
import {
  useCreateBranchMutation,
  useReadyMutation,
  useSaveVersionMutation,
  useSwitchBranchMutation,
  useUnreadyMutation,
} from "../lib/data/hooks";
import { BringInMenu } from "./BringInMenu";
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
  ready,
  peers,
  editingLocked,
  cutSwitching,
  comparing,
  onBranchChanged,
  onChangesClick,
  onBringIn,
}: {
  currentBranch: string;
  cuts: BranchListItem[];
  /** The head card's name, or null while the two queries are out of step. */
  headCardName: string | null;
  /** undefined = the diff has not answered yet: show the chip without a number. */
  changesCount: number | undefined;
  /** F3(4) — the CURRENT cut's Ready state (null on main, and when unmarked). */
  ready: BranchListItem["ready"];
  /**
   * J1 lock (2) — the peers standing on ANOTHER cut, one chip each (#218).
   * A peer on the SAME cut gets no words at all: their coloured playhead in
   * the timeline is the whole signal.
   */
  peers: Peer[];
  editingLocked: boolean;
  /**
   * B4a fix 1(a) — a cut change Shell started (the Agent panel's `View` /
   * `Bring into main`) or an agent run is in flight. The mutation lives in
   * Shell, so this bar's own `busy` cannot see it; without it a second
   * navigation could start from here while the first was still in the air.
   */
  cutSwitching: boolean;
  /** B2 #36 — the Compare view is open: the chip's slot says `Comparing`. */
  comparing: boolean;
  onBranchChanged: (branch: string) => void;
  onChangesClick: () => void;
  /** B3 / F1 — open the Bring-in preview for this cut. `main` only. */
  onBringIn: (cut: string) => void;
}) {
  const [markOpen, setMarkOpen] = useState(false);
  const [versionName, setVersionName] = useState("");

  const saveVersion = useSaveVersionMutation(currentBranch);
  const createBranch = useCreateBranchMutation();
  const switchBranch = useSwitchBranchMutation();
  // F3(4) — the Ready pair lives here, beside the switch mutation the Cut
  // menu already drives, so the menu stays a presentation component.
  const markReady = useReadyMutation();
  const unmarkReady = useUnreadyMutation();
  const readyPending = markReady.isPending || unmarkReady.isPending;

  const busy =
    saveVersion.isPending ||
    createBranch.isPending ||
    switchBranch.isPending ||
    readyPending ||
    cutSwitching;

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
            ready={ready}
            disabled={editingLocked}
            busy={busy}
            readyPending={readyPending}
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
            onMarkReady={(note, onSuccess) => {
              markReady.mutate(
                { cut: currentBranch, note },
                {
                  // #166. The toast is the caller's, as `Marked "‹name›".`
                  // above is — no hook in `hooks.ts` toasts on success.
                  // The dialog closes HERE and not on the click, so a
                  // refusal leaves the typed note on screen to retry.
                  onSuccess: () => {
                    showToast("Marked ready — main will see it.");
                    onSuccess();
                  },
                },
              );
            }}
            onUnmarkReady={() => {
              unmarkReady.mutate(
                { cut: currentBranch },
                { onSuccess: () => showToast("No longer marked ready.") }, // #169
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
          {/* #35/#167 — the Ready tag, right of the card name. Not a
              button and never on main. #171 lock (3): once the cut was
              edited after the mark, the SAME tag reads `Edited since
              ready` — one green family, one word at a time, never both. */}
          {ready !== null && (
            <span
              className={`topbar-ready-tag${ready.editedSince ? " is-edited" : ""}`}
            >
              {ready.editedSince ? "Edited since ready" : "Ready"}
            </span>
          )}
        </div>

        {/* #36 — while the Compare view is open the chip's slot carries a
            plain `Comparing` pill instead: not a button, no count. The
            chip (and its number) comes back the moment Compare closes. */}
        {comparing ? (
          <span className="topbar-comparing-pill">Comparing</span>
        ) : (
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
        )}

        {/* #218 / lock (2) — right of the chip, in the flexible middle
            space. Not buttons: there is nothing to press, and jumping to
            someone else's cut is what the Cut menu is for. Many peers →
            many chips in a row; the container clips rather than wrapping,
            because a wrapped top bar would change height. */}
        {peers.length > 0 && (
          <div className="topbar-presence">
            {peers.map((peer) => {
              const text = `${peer.name} is on ${peer.cut}`;
              return (
                <span
                  key={peer.tabId}
                  className="topbar-presence-chip"
                  title={text}
                >
                  <span
                    aria-hidden
                    className="topbar-presence-dot"
                    style={{ background: `hsl(${peer.colourSeed} 70% 55%)` }}
                  />
                  {text}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="topbar-version-cluster">
        {/* #29 / lock (2) — `Bring in ▾` immediately LEFT of Mark version,
            and ONLY on main: the direction is fixed, so no other cut carries
            a bring-in control at all (#30, F1). */}
        {currentBranch === "main" && (
          <BringInMenu
            cuts={cuts}
            disabled={editingLocked}
            busy={busy}
            onPick={onBringIn}
          />
        )}
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
