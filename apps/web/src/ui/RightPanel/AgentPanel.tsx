"use client";

/**
 * AgentPanel.tsx — I1's Agent column (copy #174-#189). The right panel's
 * DEFAULT view (C6): presets on top, the run-log below.
 *
 * Everything here is derived from one query. "This preset has run" is the
 * cut `agent-‹id›` existing (I1 patch (b)), so there is no local run
 * bookkeeping to drift: after a run, `refreshBranches` refetches and the
 * button changes itself.
 *
 * I1(5) — one at a time: only the preset being run says `Running…`, and
 * every other `Run` is off while any run is in flight.
 */

import type { AgentRun } from "../../lib/data/api-client";
import type { AgentPresetsQuery } from "../../lib/data/hooks";
import { formatClock } from "../../lib/format";

export function AgentPanel({
  presets,
  runPending,
  editingLocked,
  cutSwitching,
  onRun,
  onView,
  onBringIntoMain,
}: {
  presets: AgentPresetsQuery;
  /** The preset id whose run is in flight, or null. */
  runPending: string | null;
  /** View mode / Compare / offline: a run WRITES, and both buttons switch cuts. */
  editingLocked: boolean;
  /**
   * B4a fix 1(a) — a cut change is already in flight (this panel's own
   * `View` / `Bring into main`, or a run that creates a cut and can seal
   * main). A second one started here would race the first, so every button
   * on this panel waits for it.
   */
  cutSwitching: boolean;
  onRun: (presetId: string) => void;
  onView: (run: AgentRun) => void;
  onBringIntoMain: (run: AgentRun) => void;
}) {
  const rows = presets.data?.presets ?? [];
  const allRun = rows.length > 0 && rows.every((preset) => preset.run !== null);
  const anyPending = runPending !== null;

  // Copy #184 — newest first. The run's own time, not the cut's.
  const runs = rows
    .filter((preset) => preset.run !== null)
    .sort((a, b) => (a.run as AgentRun).at < (b.run as AgentRun).at ? 1 : -1);

  return (
    <div className="agent-panel">
      {/* #175 — the honesty line: these are scripts, not a live model. */}
      <p className="agent-honesty">
        Scripted presets. Each one runs on its own cut, never on main.
      </p>

      {allRun ? (
        // #189 — replaces the LIST, not the log: New project brings them back.
        <p className="agent-all-run">
          Every preset has run. Start a new project to run them again.
        </p>
      ) : (
        <div className="agent-presets">
          {rows.map((preset) => {
            const done = preset.run !== null;
            const running = runPending === preset.id;
            return (
              <div key={preset.id} className="agent-preset">
                <div className="agent-preset-text">
                  <span className="agent-preset-name">{preset.name}</span>
                  <span className="agent-preset-description">
                    {preset.description}
                  </span>
                </div>
                <button
                  type="button"
                  className="agent-run-button"
                  // #181 — a preset that has run stays in the list as a
                  // disabled `Done`; it never disappears.
                  disabled={done || anyPending || editingLocked || cutSwitching}
                  onClick={() => onRun(preset.id)}
                >
                  {done ? "Done" : running ? "Running…" : "Run"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="agent-runs-heading">Runs</h3>
      {runs.length === 0 ? (
        <p className="agent-no-runs">No runs yet.</p>
      ) : (
        <div className="agent-runs">
          {runs.map((preset) => {
            const run = preset.run as AgentRun;
            return (
              <div key={preset.id} className="agent-run">
                <span className="agent-run-title">
                  🤖 {preset.name} · {formatClock(run.at)}
                </span>
                <span className="agent-run-cut">Cut: {run.cut}</span>
                {/* Line 3 needs a run card to describe; a cut with none
                    (hand-made data only) simply has no third line. */}
                {run.commitId !== null && (
                  <span className="agent-run-summary">
                    {run.changes === 1 ? "1 change" : `${run.changes} changes`}
                    {run.summary ? `: ${run.summary}` : ""}
                  </span>
                )}
                <div className="agent-run-actions">
                  <button
                    type="button"
                    disabled={
                      editingLocked || cutSwitching || run.commitId === null
                    }
                    onClick={() => onView(run)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    disabled={editingLocked || cutSwitching}
                    onClick={() => onBringIntoMain(run)}
                  >
                    Bring into main
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
