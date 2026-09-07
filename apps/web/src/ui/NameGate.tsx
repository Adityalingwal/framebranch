"use client";

import { useState } from "react";

import { setEditorName, useEditorName } from "../lib/state/editor-name";
import { ModalShell } from "./ModalShell";
import { primaryButton, textInput } from "./styles";

/**
 * F2a — the first-visit name box (copy #38-#42). Shown once per browser tab
 * (sessionStorage) until a name is given; it cannot be dismissed any other
 * way. `Continue` stays disabled while the field is empty, so no error text
 * is needed (#42).
 */
export function NameGate() {
  const name = useEditorName();
  const [draft, setDraft] = useState("");
  const trimmed = draft.trim();

  if (name !== null) return null;

  const submit = () => {
    if (trimmed.length === 0) return;
    setEditorName(trimmed);
  };

  return (
    <ModalShell
      open
      onOpenChange={() => {
        /* the gate closes only by giving a name */
      }}
      title="What should we call you?"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--fb-text-mute)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Shown on your versions and cuts, so others can see who did what.
        </p>
        <input
          autoFocus
          style={textInput}
          placeholder="Your name"
          aria-label="Your name"
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            style={
              trimmed.length === 0
                ? { ...primaryButton, opacity: 0.45, cursor: "not-allowed" }
                : primaryButton
            }
            disabled={trimmed.length === 0}
          >
            Continue
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
