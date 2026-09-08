"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react";

import type { BranchListItem } from "../app/api/branch/route";
import { formatClock, quoted } from "../lib/format";

/**
 * B3 lock (2) / F1 — `Bring in ▾` on the top bar, on `main` ONLY: the
 * direction is fixed (a cut goes into main, never the other way), so there
 * is no bring-in control anywhere else (#30).
 *
 * A sibling of CutMenu rather than a shared component: the markup is the
 * same and it reuses the `.cut-menu-*` classes as they are, but this one
 * hangs on the RIGHT cluster and so aligns its popover to the trigger's
 * right edge (the ready-mockup's `right: 110px`) — the one real difference,
 * and not worth a prop-driven abstraction over two call sites.
 */
export function BringInMenu({
  cuts,
  disabled,
  busy,
  onPick,
}: {
  cuts: BranchListItem[];
  disabled?: boolean;
  busy?: boolean;
  onPick: (cut: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // #32 — every cut except main, in the list's own order (main first then
  // A→Z, so skipping main leaves A→Z)...
  const others = cuts.filter((cut) => cut.name !== "main");
  // ...and F3(4)(b) lifts the Ready ones to the top, newest mark first.
  // A stable sort keeps the A→Z order inside each group, so the not-Ready
  // half is untouched by this.
  const rows = [...others].sort((a, b) => {
    if ((a.ready === null) !== (b.ready === null)) return a.ready === null ? 1 : -1;
    if (a.ready === null || b.ready === null) return 0;
    return b.ready.at.localeCompare(a.ready.at);
  });
  // #29 — how many cuts carry the mark. `Edited since ready` counts: it is
  // still Ready, only with a warning on it.
  const readyCount = others.filter((cut) => cut.ready !== null).length;

  // B4a fix 1(a) — same as CutMenu: a popover that outlives its trigger's
  // disabled state would let a second cut-changing click through.
  useEffect(() => {
    if (disabled || busy) setOpen(false);
  }, [disabled, busy]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      // A Ready row is two lines and line 1 is long — `‹cut› · Ready ·
      // ‹who› · ‹time›` ellipsized at 260, hiding the very thing the row
      // exists to say. A plain `‹cut› · ‹who›` row does not need the extra
      // width, so the menu only takes it when a Ready row is in the list.
      // Line 2 (the note) may still ellipsize at one line; that is fine.
      const width = Math.max(readyCount > 0 ? 340 : 260, rect.width);
      // Right-aligned to the trigger: this control lives in the right
      // cluster, so a left-aligned menu would hang off the window.
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      setPosition({ top: rect.bottom + 5, left, width });
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
    // `readyCount` is a dependency so a mark landing from the 3s poller
    // while the menu is open re-measures it, rather than leaving the
    // Ready row it just added squeezed into 260.
  }, [open, readyCount]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`cut-menu-trigger bring-in-trigger${open ? " is-open" : ""}`}
        // #29 — the visible label stays `Bring in`; the count reaches a
        // screen reader through the accessible name instead of a bare
        // number nobody can place.
        aria-label={
          readyCount > 0
            ? `Bring in, ${readyCount} ready`
            : "Bring a cut into main"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Locked while the editor is (Compare / View / offline), exactly
        // like Mark version.
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <span className="cut-menu-trigger-label">Bring in</span>
        {/* #29 — no badge at 0: an empty count would be a permanent zero
            on a control that is usually idle. */}
        {readyCount > 0 && (
          <span className="bring-in-badge" aria-hidden>
            {readyCount}
          </span>
        )}
        <CaretDown size={12} weight="bold" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Bring a cut into main"
            className="cut-menu-popover"
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            {/* #31 */}
            <div className="cut-menu-heading">Bring a cut into main</div>
            {others.length === 0 ? (
              // #34 — a fact, not an instruction: making a cut lives in the
              // Cut menu and is not repeated here.
              <div className="bring-in-empty">No other cuts yet</div>
            ) : (
              rows.map((cut) => {
                // #33/#170 — a Ready row is two lines under a green dot;
                // #171 adds ` · edited since · ` between `Ready` and the
                // name. The literal ` · ` separators live in the DOM text
                // (B3 fix 4), so a screen reader reads the row as it looks.
                const line1 =
                  cut.ready === null
                    ? // #32 — not Ready: `‹cut› · ‹who›`, nothing else. No
                      // grey dot, no status word: the absence of the green
                      // dot IS the signal (F3(4) has no "not ready" state).
                      cut.createdBy
                      ? `${cut.name} · ${cut.createdBy}`
                      : cut.name
                    : `${cut.name} · Ready · ${
                        cut.ready.editedSince ? "edited since · " : ""
                      }${cut.ready.by} · ${formatClock(cut.ready.at)}`;
                return (
                  <button
                    key={cut.name}
                    type="button"
                    role="menuitem"
                    className={`cut-menu-item${cut.ready ? " is-ready" : ""}`}
                    aria-label={line1}
                    onClick={() => {
                      setOpen(false);
                      onPick(cut.name);
                    }}
                  >
                    {cut.ready !== null && (
                      <span className="bring-in-dot" aria-hidden />
                    )}
                    <span className="bring-in-row">
                      <span className="cut-menu-item-label">{line1}</span>
                      {cut.ready !== null && (
                        <span className="bring-in-note">
                          {quoted(cut.ready.note)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
