/**
 * styles.ts — shared inline-style fragments so buttons/chips look the same
 * everywhere without copy-pasting the same object literal in six files.
 * Plain style objects (not Tailwind classes) because most of these values
 * are the literal design-lock tokens (gradients, exact shadow strings) that
 * don't map cleanly onto default Tailwind utilities.
 */

import type { CSSProperties } from "react";

export const primaryButton: CSSProperties = {
  background:
    "linear-gradient(180deg, var(--fb-accent-from), var(--fb-accent-to))",
  color: "#fff",
  border: "none",
  borderRadius: "var(--fb-radius-pill)",
  padding: "6px 16px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

export const secondaryButton: CSSProperties = {
  background: "var(--fb-panel-2)",
  color: "var(--fb-text-body)",
  border: "none",
  borderRadius: "var(--fb-radius-pill)",
  padding: "6px 16px",
  fontSize: 12,
  fontWeight: 400,
  cursor: "pointer",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.04)",
};

export const dangerButton: CSSProperties = {
  ...secondaryButton,
  color: "var(--fb-bad)",
};

export const disabledButton: CSSProperties = {
  opacity: 0.45,
  cursor: "not-allowed",
};

export const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--fb-panel-2)",
  borderRadius: "var(--fb-radius-pill)",
  padding: "4px 12px",
  fontSize: 11,
  color: "var(--fb-text-dim)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,.07), inset 0 0 0 1px rgba(255,255,255,.04)",
};

export const textInput: CSSProperties = {
  width: "100%",
  background: "var(--fb-deep)",
  color: "var(--fb-text-body-2)",
  border: "none",
  borderRadius: "var(--fb-radius-sm)",
  padding: "8px 10px",
  fontSize: 12,
  boxShadow:
    "inset 0 1px 2px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.07)",
  outline: "none",
};
