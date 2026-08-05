"use client";

import { useState } from "react";

import { ModalShell } from "./ModalShell";
import { primaryButton, secondaryButton, textInput } from "./styles";

export function BranchControl({
  current,
  known,
  disabled,
  onSwitch,
  onCreate,
  busy,
}: {
  current: string;
  known: string[];
  disabled?: boolean;
  onSwitch: (to: string) => void;
  onCreate: (name: string) => void;
  busy?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const nameTaken = known.some(
    (b) => b.toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <label
        htmlFor="branch-select"
        style={{ fontSize: 11, color: "var(--fb-text-mute)" }}
      >
        Branch
      </label>
      <select
        id="branch-select"
        value={current}
        disabled={disabled || busy}
        onChange={(e) => {
          if (e.target.value !== current) onSwitch(e.target.value);
        }}
        style={{
          background: "var(--fb-panel-2)",
          color: "var(--fb-text-body-2)",
          border: "none",
          borderRadius: "var(--fb-radius-sm)",
          padding: "6px 8px",
          fontSize: 12,
          outline: "none",
        }}
      >
        {known.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <button
        type="button"
        title="New branch"
        aria-label="New branch"
        disabled={disabled || busy}
        onClick={() => {
          setName("");
          setCreateOpen(true);
        }}
        style={{ ...secondaryButton, padding: "6px 10px" }}
      >
        +
      </button>

      <ModalShell
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New branch"
      >
        <p
          style={{
            fontSize: 12,
            color: "var(--fb-text-dim)",
            margin: 0,
            marginBottom: 10,
          }}
        >
          Starts from <b>{current}</b>&rsquo;s current state.
        </p>
        <input
          autoFocus
          style={textInput}
          placeholder="Branch name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed && !nameTaken) {
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
            style={{
              ...primaryButton,
              ...(trimmed && !nameTaken ? {} : { opacity: 0.45, cursor: "not-allowed" }),
            }}
            disabled={!trimmed || nameTaken}
            onClick={() => {
              onCreate(trimmed);
              setCreateOpen(false);
            }}
          >
            Create
          </button>
        </div>
      </ModalShell>
    </div>
  );
}
