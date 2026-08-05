"use client";

import { ModalShell } from "./ModalShell";
import { dangerButton, secondaryButton } from "./styles";

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
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
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
          Cancel
        </button>
        <button
          type="button"
          style={dangerButton}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
