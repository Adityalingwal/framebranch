"use client";

/**
 * ModalShell.tsx — the one primitive pulled in from outside Tailwind (M8
 * lock 1: "one or two primitives only where they genuinely save time").
 * Radix's Dialog gives focus-trap, Escape-to-close, and scroll-lock for
 * free; hand-rolling those correctly for two dialogs (confirm + create
 * branch) would cost more than it saves.
 */

import * as Dialog from "@radix-ui/react-dialog";

export function ModalShell({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            zIndex: 400,
          }}
        />
        <Dialog.Content
          className="surface-lg"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 340,
            maxWidth: "calc(100vw - 32px)",
            padding: 20,
            zIndex: 401,
          }}
        >
          <Dialog.Title
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--fb-text-body-2)",
              margin: 0,
              marginBottom: 12,
            }}
          >
            {title}
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
