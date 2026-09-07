"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown } from "@phosphor-icons/react";

import type { BranchListItem } from "../app/api/branch/route";

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
  // A→Z, so skipping main leaves A→Z).
  const others = cuts.filter((cut) => cut.name !== "main");

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(260, rect.width);
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
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`cut-menu-trigger bring-in-trigger${open ? " is-open" : ""}`}
        aria-label="Bring a cut into main"
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
        {/* B4 puts the Ready count badge (#29 `‹N›`) here. */}
        <span className="cut-menu-trigger-label">Bring in</span>
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
              others.map((cut) => (
                <button
                  key={cut.name}
                  type="button"
                  role="menuitem"
                  className="cut-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onPick(cut.name);
                  }}
                >
                  {/* #32 — `‹cut› · ‹who›`, nothing else. B4 adds the Ready
                      dot, the `Ready · ‹who› · ‹time›` line (#33) and the
                      note; the absence of the dot is the signal until then. */}
                  <span className="cut-menu-item-label">
                    {cut.createdBy ? `${cut.name} · ${cut.createdBy}` : cut.name}
                  </span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
