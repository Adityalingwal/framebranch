"use client";

import { useToast } from "../lib/toast-status";

export function ToastHost() {
  const toast = useToast();
  if (!toast) return null;

  return (
    <div
      key={toast.id}
      role="status"
      className="surface-lg chrome-blur motion-large"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 200,
        padding: "10px 16px",
        fontSize: 12,
        color:
          toast.kind === "error" ? "var(--fb-bad)" : "var(--fb-text-body-2)",
        maxWidth: 420,
      }}
    >
      {toast.message}
    </div>
  );
}
