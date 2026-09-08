"use client";

/**
 * NewProjectDialog.tsx — G1's "New project" picker (copy #43-#49).
 *
 * One project at a time: starting a preset CLOSES the open one, cuts and
 * history included. The body line (#45) IS the warning — there is no
 * confirm-before-confirm, and the old `Reset demo?` box went with the item
 * that opened it.
 *
 * The rows come from `GET /api/presets`, fetched only while this dialog is
 * open. `Start` stays disabled until they arrive: waiting has no string of
 * its own on the copy sheet, so it is shown as a disabled control, not as
 * invented spinner text.
 */

import { useEffect, useState } from "react";

import { useNewProjectMutation, usePresetsQuery } from "../lib/data/hooks";
import { showToast } from "../lib/state/toast-status";
import { ModalShell } from "./ModalShell";
import { disabledButton, primaryButton, secondaryButton } from "./styles";

export function NewProjectDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shell's reset: main, Agent panel, selection/playhead/pair/bring-in. */
  onStarted: () => void;
}) {
  const presets = usePresetsQuery(open);
  const newProject = useNewProjectMutation();
  const [chosen, setChosen] = useState<string | null>(null);

  const rows = presets.data?.presets ?? [];
  // G1 patch (a): the first preset is the default demo, so it is also the
  // preselected row. Re-arm it whenever the dialog opens or the list lands.
  useEffect(() => {
    if (!open) setChosen(null);
    else if (chosen === null && rows.length > 0) setChosen(rows[0].id);
  }, [open, rows, chosen]);

  const busy = newProject.isPending;

  return (
    <ModalShell open={open} onOpenChange={onOpenChange} title="New project">
      <p
        style={{
          margin: "0 0 14px",
          color: "var(--fb-text-dim)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Pick a starting point. The project you have open closes — its cuts and
        history go with it.
      </p>

      <div className="preset-picker" role="radiogroup" aria-label="Starting point">
        {rows.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={chosen === preset.id}
            className={`preset-row${chosen === preset.id ? " is-chosen" : ""}`}
            disabled={busy}
            onClick={() => setChosen(preset.id)}
          >
            <span className="preset-row-name">{preset.name}</span>
            <span className="preset-row-meta">
              {preset.clipCount === 1 ? "1 clip" : `${preset.clipCount} clips`} ·{" "}
              {preset.duration}
            </span>
          </button>
        ))}
      </div>

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
          style={{ ...secondaryButton, ...(busy ? disabledButton : {}) }}
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          style={{
            ...primaryButton,
            ...(busy || chosen === null ? disabledButton : {}),
          }}
          disabled={busy || chosen === null}
          onClick={() => {
            if (chosen === null) return;
            newProject.mutate(
              { preset: chosen },
              {
                onSuccess: (data) => {
                  onOpenChange(false);
                  onStarted();
                  showToast(`Started "${data.preset.name}".`);
                },
              },
            );
          }}
        >
          Start
        </button>
      </div>
    </ModalShell>
  );
}
