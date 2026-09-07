"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Command, PropertyValue, Track } from "@framebranch/engine";
import { ArrowsInLineHorizontal, Scissors, Trash } from "@phosphor-icons/react";

import { ApiClientError } from "../lib/data/api-client";
import { clipDisplayName, findClipById, findMediaRef } from "../lib/clip-helpers";
import { quoted } from "../lib/format";
import { useConnectionStatus } from "../lib/state/connection-status";
import { NOW_SIDE } from "../lib/data/api-client";
import { showToast } from "../lib/state/toast-status";
import {
  useBranchesQuery,
  useDiffQuery,
  useHistoryQuery,
  useOpsMutation,
  useRestoreMutation,
  useTimelineAtQuery,
  useTimelineQuery,
} from "../lib/data/hooks";
import { ClipProperties } from "./ClipProperties";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconRail } from "./IconRail";
import { NameGate } from "./NameGate";
import { PreviewPane } from "./PreviewPane";
import { RightPanel, type PanelView } from "./RightPanel/RightPanel";
import { TimelineView } from "./Timeline/TimelineView";
import { TopBar } from "./TopBar";

const VALID_VIEWS: PanelView[] = ["changes", "merge", "history"];
const WORKSPACE_LAYOUT_KEY = "framebranch.workspace-layout.v1";
const DEFAULT_WORKSPACE_LAYOUT = { inspectorWidth: 320, timelineHeight: 330 };
const MIN_INSPECTOR_WIDTH = 260;
const MAX_INSPECTOR_WIDTH = 520;
const MIN_TIMELINE_HEIGHT = 250;
const MIN_PREVIEW_WIDTH = 420;
const MIN_PREVIEW_HEIGHT = 220;

function parseView(raw: string | null): PanelView {
  return VALID_VIEWS.includes(raw as PanelView)
    ? (raw as PanelView)
    : "history";
}

export function Shell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("view"));

  const [currentBranch, setCurrentBranch] = useState("main");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [highlightedClipId, setHighlightedClipId] = useState<string | null>(
    null,
  );
  const [rightPanelMode, setRightPanelMode] = useState<
    "inspector" | "versioning"
  >("versioning");
  const [workspaceLayout, setWorkspaceLayout] = useState(
    DEFAULT_WORKSPACE_LAYOUT,
  );
  const [workspaceLayoutLoaded, setWorkspaceLayoutLoaded] = useState(false);
  // B5-1 — the card being looked at. Nothing is written by entering or
  // leaving; this state IS View mode.
  const [viewing, setViewing] = useState<{
    commitId: string;
    name: string;
  } | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  // B5 IMPL-NOTE (d) — the pair the Compare button hands to the Changes
  // panel; consumed once, then cleared by the panel.
  const [comparePreselect, setComparePreselect] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // Stable, so consuming the preselect cannot re-run the panel's effect on
  // an unrelated Shell render.
  const clearComparePreselect = useCallback(() => setComparePreselect(null), []);

  const timeline = useTimelineQuery(currentBranch);
  const opsMutation = useOpsMutation(currentBranch);
  const connectionLost = useConnectionStatus().lost;
  // B5-1 / B5 IMPL-NOTE (b): while a card is being viewed the editor is
  // read-only, exactly as it is while the connection is lost. ONE derived
  // flag drives every consumer that used to read the connection store on
  // its own, so nothing can be locked in one place and live in another.
  const editingPaused = connectionLost || viewing !== null;

  // ---- A1a/A1b/D2: cuts, head and the ONE changes number, derived here --
  // Every consumer (top bar, rail badge, History, Restore box) is handed
  // these, so the chip, the Now-line and the panel can never disagree.

  // A1a patch (c): the first branch GET must not race the first timeline
  // GET — two cookie-less parallel calls would mint two projects.
  const branches = useBranchesQuery(timeline.isSuccess);
  // A1a patch (c): History is Shell-owned now, so it needs the same
  // first-load gate as the branch list (two cookie-less GETs = two projects).
  const history = useHistoryQuery(currentBranch, timeline.isSuccess);

  const cuts = useMemo(
    () => branches.data?.branches ?? [],
    [branches.data?.branches],
  );
  const head = cuts.find((cut) => cut.name === currentBranch)?.head ?? null;

  // D2 patch: the chip counts the real difference Now vs the head card —
  // not clicks, not pending ops (a move and a move back is `No changes`).
  const changesQuery = useDiffQuery(currentBranch, head, NOW_SIDE);
  const changesCount = changesQuery.data?.count;

  const historyCommits = useMemo(
    () => history.data?.commits ?? [],
    [history.data?.commits],
  );
  // The two queries are invalidated together but can land in either order.
  // Index 0 of a cut's History IS its head (B2), so when it is not, what we
  // hold is mid-flight: show no current card at all rather than crown the
  // OLD head for a frame.
  const headCard =
    head !== null && historyCommits[0]?.commitId === head
      ? historyCommits[0]
      : null;

  // B5-1 — the frozen content behind View mode. The LIVE query stays
  // mounted throughout, so ✕ is instant and never flashes a refetch.
  const frozen = useTimelineAtQuery(currentBranch, viewing?.commitId ?? null);
  const restore = useRestoreMutation(currentBranch);

  /**
   * Entering View (B5-1): the clip selection is dropped and the playhead
   * goes back to 0 — a selection made on the live timeline means nothing
   * on a different version's content, and the inspector must not keep
   * showing a clip you are no longer editing.
   */
  const openView = useCallback((commit: { commitId: string; name: string }) => {
    setViewing({ commitId: commit.commitId, name: commit.name });
    setSelectedClipId(null);
    setPlayheadFrame(0);
  }, []);

  /** Leaving View: ✕, a successful Restore, a cut switch, a reset. */
  const closeView = useCallback(() => {
    setViewing(null);
    setRestoreOpen(false);
    setSelectedClipId(null);
    setPlayheadFrame(0);
  }, []);

  const clampWorkspaceLayout = useCallback(
    (next: typeof DEFAULT_WORKSPACE_LAYOUT) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      const maxInspector = bounds
        ? Math.max(
            MIN_INSPECTOR_WIDTH,
            Math.min(
              MAX_INSPECTOR_WIDTH,
              bounds.width - MIN_PREVIEW_WIDTH - 12,
            ),
          )
        : MAX_INSPECTOR_WIDTH;
      const maxTimeline = bounds
        ? Math.max(MIN_TIMELINE_HEIGHT, bounds.height - MIN_PREVIEW_HEIGHT - 12)
        : 520;
      return {
        inspectorWidth: Math.round(
          Math.min(
            maxInspector,
            Math.max(MIN_INSPECTOR_WIDTH, next.inspectorWidth),
          ),
        ),
        timelineHeight: Math.round(
          Math.min(
            maxTimeline,
            Math.max(MIN_TIMELINE_HEIGHT, next.timelineHeight),
          ),
        ),
      };
    },
    [],
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WORKSPACE_LAYOUT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<
          typeof DEFAULT_WORKSPACE_LAYOUT
        >;
        setWorkspaceLayout(
          clampWorkspaceLayout({
            inspectorWidth:
              Number(parsed.inspectorWidth) ||
              DEFAULT_WORKSPACE_LAYOUT.inspectorWidth,
            timelineHeight:
              Number(parsed.timelineHeight) ||
              DEFAULT_WORKSPACE_LAYOUT.timelineHeight,
          }),
        );
      }
    } catch {
      window.localStorage.removeItem(WORKSPACE_LAYOUT_KEY);
    } finally {
      setWorkspaceLayoutLoaded(true);
    }
  }, [clampWorkspaceLayout]);

  useEffect(() => {
    if (!workspaceLayoutLoaded) return;
    const saveTimer = window.setTimeout(() => {
      window.localStorage.setItem(
        WORKSPACE_LAYOUT_KEY,
        JSON.stringify(workspaceLayout),
      );
    }, 120);
    return () => window.clearTimeout(saveTimer);
  }, [workspaceLayout, workspaceLayoutLoaded]);

  useEffect(() => {
    const onResize = () =>
      setWorkspaceLayout((current) => clampWorkspaceLayout(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampWorkspaceLayout]);

  function beginWorkspaceResize(
    axis: "inspector" | "timeline",
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = workspaceLayout;
    document.body.classList.add(
      axis === "inspector"
        ? "workspace-is-resizing-vertical"
        : "workspace-is-resizing-horizontal",
    );

    const onMove = (moveEvent: PointerEvent) => {
      const next =
        axis === "inspector"
          ? {
              ...startLayout,
              inspectorWidth:
                startLayout.inspectorWidth - (moveEvent.clientX - startX),
            }
          : {
              ...startLayout,
              timelineHeight:
                startLayout.timelineHeight - (moveEvent.clientY - startY),
            };
      setWorkspaceLayout(clampWorkspaceLayout(next));
    };
    const onUp = () => {
      document.body.classList.remove(
        "workspace-is-resizing-vertical",
        "workspace-is-resizing-horizontal",
      );
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function nudgeWorkspaceResize(axis: "inspector" | "timeline", delta: number) {
    setWorkspaceLayout((current) =>
      clampWorkspaceLayout({
        ...current,
        ...(axis === "inspector"
          ? { inspectorWidth: current.inspectorWidth + delta }
          : { timelineHeight: current.timelineHeight + delta }),
      }),
    );
  }

  const setView = useCallback(
    (next: PanelView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.push(`?${params.toString()}`, { scroll: false });
      setRightPanelMode("versioning");
    },
    [router, searchParams],
  );

  const switchToBranch = useCallback((branch: string) => {
    setCurrentBranch(branch);
    setSelectedClipId(null);
    setPlayheadFrame(0);
    // A cut switch leaves View: the card you were looking at belongs to
    // the chain you just left.
    setViewing(null);
    setRestoreOpen(false);
  }, []);

  // A1a patch (e): the cut you are standing on stopped existing (a demo
  // reset elsewhere, a project rebuilt) → go back to `main`. Only once the
  // list has settled, so a cut created a moment ago is not mistaken for a
  // missing one while its refetch is still in the air.
  useEffect(() => {
    if (!branches.isSuccess || branches.isFetching) return;
    if (cuts.some((cut) => cut.name === currentBranch)) return;
    switchToBranch("main");
  }, [
    branches.isSuccess,
    branches.isFetching,
    cuts,
    currentBranch,
    switchToBranch,
  ]);

  const resetToFreshDemo = useCallback(() => {
    setCurrentBranch("main");
    setSelectedClipId(null);
    setPlayheadFrame(0);
    setViewing(null);
    setRestoreOpen(false);
  }, []);

  /**
   * What the preview, the timeline and the inspector are looking at: the
   * live working view normally, that card's frozen content while viewing.
   * Until the frozen answer arrives the live one stays on screen — the
   * LOCK is what makes View safe, and it is on from the first click.
   */
  const displayedTimeline =
    viewing !== null && frozen.data
      ? frozen.data.timeline
      : (timeline.data?.timeline ?? null);

  const selectedClip = useMemo(() => {
    if (!selectedClipId || !displayedTimeline) return null;
    return findClipById(displayedTimeline, selectedClipId) ?? null;
  }, [selectedClipId, displayedTimeline]);

  // A clip that no longer exists (deleted, or split into new ids) cannot
  // stay selected — the panel would otherwise render stale/undefined data.
  useEffect(() => {
    if (selectedClipId && displayedTimeline && !selectedClip) {
      setSelectedClipId(null);
    }
  }, [selectedClipId, selectedClip, displayedTimeline]);

  const mediaRef = useMemo(() => {
    if (!selectedClip || !displayedTimeline) return undefined;
    if ("textContent" in selectedClip) return undefined;
    return findMediaRef(displayedTimeline, selectedClip.mediaRefId);
  }, [selectedClip, displayedTimeline]);

  const rate = displayedTimeline?.projectRate ?? 1;

  const emit = useCallback(
    (command: Command, options?: { onError?: () => void }) => {
      // ONE funnel: every edit verb (add/move/trim/slip/split/delete/
      // ripple-delete/property/replaceTracks) comes through here, so this
      // is the only place the two read-only states have to be enforced.
      if (viewing !== null) {
        showToast("You're viewing an old version. Close it to edit.");
        return;
      }
      if (connectionLost) return; // C6: editing paused while the connection is lost
      opsMutation.mutate(command, options);
    },
    [connectionLost, viewing, opsMutation],
  );

  // Bumped whenever a propertyChange is rejected, so ClipProperties can
  // remount its local-state controls back to the authoritative clip value —
  // a rejection that doesn't change the clip's data (rollback = the value
  // it already was) never fires the controls' own "value changed" re-sync,
  // so without this an out-of-range/rejected input stays stuck on screen.
  const [propertyErrorTick, setPropertyErrorTick] = useState(0);

  // Add clip — the command is built where the track data lives (TrackRow);
  // this just funnels it through the same ops pipeline as every other edit.
  const handleAddClip = useCallback(
    (command: Command) => {
      emit(command);
    },
    [emit],
  );

  const handleMove = useCallback(
    (clipId: string, newStartFrame: number) => {
      emit({ op: "move", clipId, newStart: { value: newStartFrame, rate } });
    },
    [emit, rate],
  );
  const handleTrim = useCallback(
    (clipId: string, edge: "start" | "end", deltaFrame: number) => {
      emit({ op: "trim", clipId, edge, delta: { value: deltaFrame, rate } });
    },
    [emit, rate],
  );
  const handleSlip = useCallback(
    (clipId: string, deltaFrame: number) => {
      emit({ op: "slip", clipId, delta: { value: deltaFrame, rate } });
    },
    [emit, rate],
  );
  const handleSplit = useCallback(
    (clipId: string, atFrame: number) => {
      emit({ op: "split", clipId, at: { value: atFrame, rate } });
    },
    [emit, rate],
  );
  const handleReplaceTracks = useCallback(
    (tracks: Track[]) => emit({ op: "replaceTracks", tracks }),
    [emit],
  );
  const handleDelete = useCallback(
    (clipId: string) => {
      emit({ op: "deleteClip", clipId });
      setSelectedClipId(null);
    },
    [emit],
  );
  const handleRippleDelete = useCallback(
    (clipId: string) => {
      emit({ op: "rippleDelete", clipId });
      setSelectedClipId(null);
    },
    [emit],
  );
  const handlePropertyChange = useCallback(
    (
      clipId: string,
      property:
        | "volume"
        | "opacity"
        | "scale"
        | "position"
        | "textContent"
        | "textStyle",
      value: PropertyValue,
    ) => {
      emit(
        { op: "propertyChange", clipId, property, value },
        { onError: () => setPropertyErrorTick((t) => t + 1) },
      );
    },
    [emit],
  );

  // §5: "Delete on a selected clip" — the keyboard path, ignored while
  // typing in a text field/input so it never hijacks normal editing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      // The lock covers the keyboard too (B5 IMPL-NOTE b): while a card is
      // being viewed, Delete and Ctrl+K do nothing at all.
      if (editingPaused) return;
      const shortcut = e.ctrlKey || e.metaKey;
      if (shortcut && e.key.toLowerCase() === "k" && selectedClip) {
        const start = selectedClip.timelineRange.start.value;
        const end = start + selectedClip.timelineRange.duration.value;
        if (playheadFrame > start && playheadFrame < end) {
          e.preventDefault();
          handleSplit(selectedClip.id, playheadFrame);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        if (e.shiftKey) handleRippleDelete(selectedClipId);
        else handleDelete(selectedClipId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editingPaused,
    selectedClip,
    selectedClipId,
    playheadFrame,
    handleDelete,
    handleRippleDelete,
    handleSplit,
  ]);

  if (timeline.isLoading) {
    return <FullPageMessage>Loading FrameBranch…</FullPageMessage>;
  }

  if (timeline.isError) {
    const message =
      timeline.error instanceof ApiClientError
        ? timeline.error.message
        : "Couldn't reach the server.";
    return (
      <FullPageMessage>
        <p style={{ marginBottom: 12 }}>{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: "var(--fb-panel-2)",
            color: "var(--fb-text-body)",
            border: "none",
            borderRadius: "var(--fb-radius-pill)",
            padding: "6px 16px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </FullPageMessage>
    );
  }

  const data = timeline.data!;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* F2a — asks for a display name once per tab, before any edit. */}
      <NameGate />
      <TopBar
        currentBranch={currentBranch}
        cuts={cuts}
        headCardName={headCard?.name ?? null}
        changesCount={changesCount}
        editingLocked={editingPaused}
        onChangesClick={() => {
          setView("changes");
          setRightPanelMode("versioning");
        }}
        onBranchChanged={switchToBranch}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
        <IconRail
          view={view}
          versioningOpen={rightPanelMode === "versioning"}
          currentBranch={currentBranch}
          changesCount={changesCount}
          editingLocked={editingPaused}
          onViewChange={setView}
          onDemoReset={resetToFreshDemo}
        />
        <div
          ref={workspaceRef}
          className="editor-workspace"
          style={{
            flex: 1,
            display: "grid",
            gridTemplateRows: `minmax(${MIN_PREVIEW_HEIGHT}px, 1fr) 12px ${workspaceLayout.timelineHeight}px`,
            minHeight: 0,
            minWidth: 0,
            padding: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 0,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <div
              className="editor-preview-column"
              style={{
                flex: "1 1 auto",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <PreviewPane
                clip={selectedClip}
                mediaRef={mediaRef}
                playheadFrame={playheadFrame}
                projectRate={rate}
                onSetPlayhead={setPlayheadFrame}
              />
            </div>
            <WorkspaceResizeHandle
              orientation="vertical"
              value={workspaceLayout.inspectorWidth}
              min={MIN_INSPECTOR_WIDTH}
              max={MAX_INSPECTOR_WIDTH}
              label="Resize inspector"
              onPointerDown={(event) =>
                beginWorkspaceResize("inspector", event)
              }
              onDoubleClick={() =>
                setWorkspaceLayout((current) =>
                  clampWorkspaceLayout({
                    ...current,
                    inspectorWidth: DEFAULT_WORKSPACE_LAYOUT.inspectorWidth,
                  }),
                )
              }
              onNudge={(delta) => nudgeWorkspaceResize("inspector", delta)}
            />
            <div
              className="editor-right-column"
              style={{
                flex: `0 0 ${workspaceLayout.inspectorWidth}px`,
                minHeight: 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {rightPanelMode === "versioning" || !selectedClip ? (
                <RightPanel
                  view={view}
                  onViewChange={setView}
                  currentBranch={currentBranch}
                  head={head}
                  headCardName={headCard?.name ?? null}
                  changesCount={changesCount}
                  viewingCommitId={viewing?.commitId ?? null}
                  editingLocked={editingPaused}
                  comparePreselect={comparePreselect}
                  onComparePreselectConsumed={clearComparePreselect}
                  onHighlightClip={setHighlightedClipId}
                  onViewCard={openView}
                  hasInspector={Boolean(selectedClip)}
                  onCloseToInspector={() => setRightPanelMode("inspector")}
                />
              ) : (
                <ClipProperties
                  clip={selectedClip}
                  displayName={clipDisplayName(selectedClip, mediaRef)}
                  mediaKind={mediaRef?.kind}
                  disabled={editingPaused}
                  resetToken={propertyErrorTick}
                  onPropertyChange={handlePropertyChange}
                />
              )}
            </div>
          </div>
          <WorkspaceResizeHandle
            orientation="horizontal"
            value={workspaceLayout.timelineHeight}
            min={MIN_TIMELINE_HEIGHT}
            max={520}
            label="Resize timeline"
            onPointerDown={(event) => beginWorkspaceResize("timeline", event)}
            onDoubleClick={() =>
              setWorkspaceLayout((current) =>
                clampWorkspaceLayout({
                  ...current,
                  timelineHeight: DEFAULT_WORKSPACE_LAYOUT.timelineHeight,
                }),
              )
            }
            onNudge={(delta) => nudgeWorkspaceResize("timeline", delta)}
          />
          <div
            className="surface-lg timeline-workspace-shell"
            style={{ height: "100%", minWidth: 0, overflow: "hidden" }}
          >
            {/* B5-1 (#85-#88) — the View bar. Minimal on purpose: what you
                are looking at, and the only three things you can do from
                here. Restore is HIDDEN on the current card (B1: never on
                the card you are standing on); Compare always shows. */}
            {viewing && (
              <div className="view-bar" aria-label="Viewing an old version">
                <span className="view-bar-text">
                  {`Viewing ${quoted(viewing.name)}`}
                </span>
                <span className="view-bar-actions">
                  <button
                    type="button"
                    className="view-bar-button"
                    onClick={() => {
                      setComparePreselect({
                        from: viewing.commitId,
                        to: NOW_SIDE,
                      });
                      setView("changes");
                      setRightPanelMode("versioning");
                    }}
                  >
                    Compare
                  </button>
                  {viewing.commitId !== head && (
                    <button
                      type="button"
                      className="view-bar-button"
                      onClick={() => setRestoreOpen(true)}
                    >
                      Restore this version
                    </button>
                  )}
                  <button
                    type="button"
                    className="view-bar-close"
                    aria-label="Back to editing"
                    onClick={closeView}
                  >
                    ✕
                  </button>
                </span>
              </div>
            )}

            {/* Clip action strip — only visible when a clip is selected */}
            {selectedClip &&
              (() => {
                const clipStart = selectedClip.timelineRange.start.value;
                const clipEnd =
                  clipStart + selectedClip.timelineRange.duration.value;
                const canSplit =
                  playheadFrame > clipStart && playheadFrame < clipEnd;
                return (
                  <div
                    className="clip-edit-toolbar"
                    aria-label="Selected clip editing actions"
                  >
                    <span className="clip-edit-toolbar-label">Editing</span>
                    <span className="clip-edit-toolbar-divider" aria-hidden />
                    <button
                      type="button"
                      className="clip-edit-action"
                      disabled={editingPaused || !canSplit}
                      title={
                        canSplit
                          ? "Split at playhead (Ctrl+K)"
                          : "Move playhead inside clip first"
                      }
                      onClick={() =>
                        handleSplit(selectedClip.id, playheadFrame)
                      }
                    >
                      <Scissors size={14} weight="duotone" aria-hidden />
                      Split
                    </button>
                    <button
                      type="button"
                      className="clip-edit-action"
                      disabled={editingPaused}
                      title="Delete and close gap (Shift+Delete)"
                      onClick={() => handleRippleDelete(selectedClip.id)}
                    >
                      <ArrowsInLineHorizontal
                        size={14}
                        weight="duotone"
                        aria-hidden
                      />
                      Delete &amp; close gap
                    </button>
                    <button
                      type="button"
                      className="clip-edit-action is-danger"
                      disabled={editingPaused}
                      title="Delete selected clip (Delete)"
                      onClick={() => handleDelete(selectedClip.id)}
                    >
                      <Trash size={14} weight="duotone" aria-hidden />
                      Delete
                    </button>
                  </div>
                );
              })()}
            <TimelineView
              timeline={displayedTimeline ?? data.timeline}
              selectedClipId={selectedClipId}
              highlightedClipId={highlightedClipId}
              playheadFrame={playheadFrame}
              onSelectClip={(clip: {
                id: string;
                timelineRange: {
                  start: { value: number };
                  duration: { value: number };
                };
              }) => {
                setSelectedClipId(clip.id);
                setRightPanelMode("inspector");
                const clipStart = clip.timelineRange.start.value;
                const clipEnd = clipStart + clip.timelineRange.duration.value;
                if (playheadFrame < clipStart || playheadFrame > clipEnd) {
                  setPlayheadFrame(clipStart);
                }
              }}
              onSetPlayhead={setPlayheadFrame}
              onMove={handleMove}
              onTrim={handleTrim}
              onSlip={handleSlip}
              onSplit={handleSplit}
              onAddClip={handleAddClip}
              onReplaceTracks={handleReplaceTracks}
              editingLocked={editingPaused}
            />
          </div>
        </div>
      </div>

      {/* B5-2b (#90-#92) — the box says all three things the lock demands:
          a new version goes ON TOP, the edits since the current card are
          kept, nothing is deleted. The middle sentence appears only when
          there ARE such edits. */}
      <ConfirmDialog
        open={restoreOpen && viewing !== null}
        onOpenChange={setRestoreOpen}
        title={`Restore ${quoted(viewing?.name ?? "")}?`}
        description={[
          "A new version with this content goes on top of History.",
          changesCount !== undefined && changesCount > 0 && headCard
            ? `Your edits since ${quoted(headCard.name)} are kept in an auto-save.`
            : null,
          "Nothing is deleted.",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel="Restore"
        tone="primary"
        busy={restore.isPending}
        onConfirm={() => {
          if (!viewing) return;
          const restored = viewing.name;
          restore.mutate(viewing.commitId, {
            onSuccess: () => {
              closeView();
              showToast(`Restored ${quoted(restored)} — added as a new version.`);
            },
          });
        }}
      />
    </div>
  );
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--fb-text-dim)",
        fontSize: 13,
        background: "transparent",
      }}
    >
      {children}
    </div>
  );
}

function WorkspaceResizeHandle({
  orientation,
  value,
  min,
  max,
  label,
  onPointerDown,
  onDoubleClick,
  onNudge,
}: {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`workspace-resizer is-${orientation}`}
      title={`${label} · double-click to reset`}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 40 : 10;
        if (orientation === "vertical") {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          onNudge(event.key === "ArrowLeft" ? step : -step);
        } else {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onNudge(event.key === "ArrowUp" ? step : -step);
        }
      }}
    >
      <span aria-hidden />
    </div>
  );
}
