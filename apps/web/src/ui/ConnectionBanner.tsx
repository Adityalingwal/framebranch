"use client";

import {
  CONNECTION_LOST_MESSAGE,
  useConnectionStatus,
} from "../lib/state/connection-status";

/**
 * The C6 failure banner — exact copy, a [Retry] button that keeps reusing
 * the same in-flight ticket for as many presses as it takes.
 */
export function ConnectionBanner() {
  const status = useConnectionStatus();
  if (!status.lost) return null;

  return (
    <div
      role="alert"
      className="chrome-blur motion-hover"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "10px 16px",
        fontSize: 12,
        color: "var(--fb-text-body-2)",
        boxShadow: "0 1px 0 rgba(255,255,255,.06), 0 4px 16px rgba(0,0,0,.4)",
      }}
    >
      <span style={{ color: "var(--fb-warn)" }}>●</span>
      <span>{CONNECTION_LOST_MESSAGE}</span>
      <button
        type="button"
        onClick={() => status.retry?.()}
        className="motion-hover"
        style={{
          background:
            "linear-gradient(180deg, var(--fb-accent-from), var(--fb-accent-to))",
          color: "#fff",
          border: "none",
          borderRadius: "var(--fb-radius-pill)",
          padding: "4px 14px",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
