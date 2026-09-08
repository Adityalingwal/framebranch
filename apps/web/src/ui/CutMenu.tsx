"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";

import type { BranchListItem } from "../app/api/branch/route";
import { ModalShell } from "./ModalShell";
import { primaryButton, secondaryButton, textInput } from "./styles";

/**
 * A2/C3 — the cut control in the top bar: `Cut: ‹cut› ▾` opening a menu of
 * every cut (from `GET /api/branch`, A1a) plus `New cut…`.
 *
 * Replaces BranchControl's select + `+` pair. A portal menu rather than a
 * `<select>` for the same reason CustomSelect is one: a row is two pieces
 * of text (`‹cut› · ‹who›`, #5) and the current row is highlighted with no
 * extra word (#6 — the trigger already says which cut you are on).
 */
export function CutMenu({
  current,
  cuts,
  ready,
  disabled,
  busy,
  readyPending,
  onSwitch,
  onCreate,
  onMarkReady,
  onUnmarkReady,
}: {
  current: string;
  cuts: BranchListItem[];
  /** F3(4) — the CURRENT cut's Ready state; `main` never has one. */
  ready: BranchListItem["ready"];
  disabled?: boolean;
  busy?: boolean;
  /** A Ready mutation is in the air: the dialog's button waits for it. */
  readyPending?: boolean;
  onSwitch: (to: string) => void;
  onCreate: (name: string) => void;
  /**
   * The dialog stays open until the server answers: `onSuccess` is what
   * closes it, so a refusal keeps the note the person typed instead of
   * throwing it away behind a toast. Same shape as `Mark version`.
   */
  onMarkReady: (note: string, onSuccess: () => void) => void;
  onUnmarkReady: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const trimmed = name.trim();
  const nameTaken = cuts.some(
    (cut) => cut.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed.length > 0 && !nameTaken;

  // B4a fix 1(a) — the trigger going disabled does NOT close the popover on
  // its own: it is a portal, and the click that disabled the trigger (an
  // Agent `View` / `Bring into main`, a run) never touched it. An open menu
  // over a locked editor is a live second navigation, so it closes here.
  useEffect(() => {
    if (disabled || busy) setOpen(false);
  }, [disabled, busy]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(200, rect.width);
      const maxLeft = window.innerWidth - width - 8;
      setPosition({
        top: rect.bottom + 5,
        left: Math.max(8, Math.min(rect.left, maxLeft)),
        width,
      });
    };
    update();
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (
        !triggerRef.current?.contains(node) &&
        !menuRef.current?.contains(node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function openCreate() {
    setOpen(false);
    setName("");
    setCreateOpen(true);
  }

  // F3(4)(a) — Ready lives on the cut you are standing on, and `main` is
  // what cuts are brought INTO, so it can never be ready for itself.
  const showReadyItems = current !== "main";
  const trimmedNote = note.trim();
  const canMarkReady = trimmedNote.length > 0 && !readyPending;

  function openReady() {
    setOpen(false);
    setNote("");
    setReadyOpen(true);
  }

  function submitReady() {
    if (!canMarkReady) return;
    onMarkReady(trimmedNote, () => setReadyOpen(false));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`cut-menu-trigger${open ? " is-open" : ""}`}
        aria-label="Current cut"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span className="cut-menu-trigger-label">Cut: {current}</span>
        <CaretDown size={12} weight="bold" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Cuts"
            className="cut-menu-popover"
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            <div className="cut-menu-heading">Cuts</div>
            {cuts.map((cut) => (
              <button
                key={cut.name}
                type="button"
                role="menuitem"
                className={`cut-menu-item${cut.name === current ? " is-current" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (cut.name !== current) onSwitch(cut.name);
                }}
              >
                <span className="cut-menu-item-label">
                  {cut.createdBy ? `${cut.name} · ${cut.createdBy}` : cut.name}
                </span>
                {cut.name === current && (
                  <Check size={13} weight="bold" aria-hidden />
                )}
              </button>
            ))}
            {/* F3(4)(a) — the Ready pair, for the CURRENT cut only and
                never on main. One slot, two strings: #8/#161 before the
                mark, #9/#168 after it (`Edited since ready` is still
                Ready, so it keeps the second one). Un-marking has no
                dialog — F3(4) has nothing to confirm. */}
            {showReadyItems && (
              <>
                <div className="cut-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="cut-menu-item"
                  onClick={() => {
                    if (ready === null) {
                      openReady();
                      return;
                    }
                    setOpen(false);
                    onUnmarkReady();
                  }}
                >
                  <span className="cut-menu-item-label">
                    {ready === null
                      ? "✓ Ready for main…"
                      : "✕ Not ready anymore"}
                  </span>
                </button>
              </>
            )}
            <div className="cut-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="cut-menu-item"
              onClick={openCreate}
            >
              <span className="cut-menu-item-label">New cut…</span>
            </button>
          </div>,
          document.body,
        )}

      <ModalShell open={createOpen} onOpenChange={setCreateOpen} title="New cut">
        <p
          style={{
            fontSize: 12,
            color: "var(--fb-text-dim)",
            margin: 0,
            marginBottom: 10,
          }}
        >
          {`Starts from "${current}" as it is right now.`}
        </p>
        <input
          autoFocus
          style={textInput}
          placeholder="Name this cut…"
          aria-label="Cut name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canCreate) {
              onCreate(trimmed);
              setCreateOpen(false);
            }
          }}
        />
        {nameTaken && (
          <p style={{ fontSize: 11, color: "var(--fb-bad)", marginTop: 6 }}>
            That name is taken.
          </p>
        )}
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
            onClick={() => setCreateOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            style={
              canCreate
                ? primaryButton
                : { ...primaryButton, opacity: 0.45, cursor: "not-allowed" }
            }
            disabled={!canCreate}
            onClick={() => {
              onCreate(trimmed);
              setCreateOpen(false);
            }}
          >
            Create cut
          </button>
        </div>
      </ModalShell>

      {/* F3(4)(a) — the Ready dialog. #162 title, #163 body, #164 note,
          #165 buttons. The note is REQUIRED (one line is the whole point
          of the mark), so `Mark ready` is off while it is empty; the
          server refuses an empty one too. */}
      <ModalShell
        open={readyOpen}
        onOpenChange={setReadyOpen}
        title="Ready for main"
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--fb-text-dim)",
            margin: 0,
            marginBottom: 10,
          }}
        >
          Whoever is on main will see this cut marked ready, with your note,
          and can bring it in. Nothing changes on main until they do.
        </p>
        <input
          autoFocus
          style={textInput}
          placeholder="What's in this cut? One line for whoever brings it in."
          aria-label="Ready note"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitReady();
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
            onClick={() => setReadyOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            style={
              canMarkReady
                ? primaryButton
                : { ...primaryButton, opacity: 0.45, cursor: "not-allowed" }
            }
            disabled={!canMarkReady}
            onClick={submitReady}
          >
            Mark ready
          </button>
        </div>
      </ModalShell>
    </>
  );
}
