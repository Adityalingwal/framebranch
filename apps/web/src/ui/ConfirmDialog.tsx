"use client";

import { ModalShell } from "./ModalShell";
import { dangerButton, primaryButton, secondaryButton } from "./styles";

/**
 * Generic confirm dialog. Used by Reset demo — locked: "DISCARD endpoints
 * need a confirm" (M8 lock, §8.4).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  busy,
  tone = "danger",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /**
   * B3 #157 — the Bring-in cancel box needs `Keep going`, because "Cancel"
   * would mean two different things in one dialog. Defaults to `Cancel`, so
   * B1's Restore box is untouched.
   */
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  /** `danger` (red) for discard-type actions; `primary` for Restore (B5: it deletes nothing). */
  tone?: "danger" | "primary";
}) {
  return (
    <ModalShell open={open} onOpenChange={onOpenChange} title={title}>
      <p
        style={{
          fontSize: 12,
          color: "var(--fb-text-dim)",
          margin: 0,
          marginBottom: 18,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          style={secondaryButton}
          onClick={() => onOpenChange(false)}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          style={tone === "danger" ? dangerButton : primaryButton}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
