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
  disabled,
  busy,
  onSwitch,
  onCreate,
}: {
  current: string;
  cuts: BranchListItem[];
  disabled?: boolean;
  busy?: boolean;
  onSwitch: (to: string) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
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
            {/* B4 puts the Ready items (#8 `✓ Ready for main…` / #9
                `✕ Not ready anymore`) here, on non-main cuts only. */}
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
    </>
  );
}
