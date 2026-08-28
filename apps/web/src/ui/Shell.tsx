"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Command, PropertyValue, Track } from "@framebranch/engine";
import type { PendingOp } from "../server/types";
import { ArrowsInLineHorizontal, Scissors, Trash } from "@phosphor-icons/react";

import { ApiClientError } from "../lib/data/api-client";
import { clipLabel, findClipById, findMediaRef } from "../lib/clip-helpers";
import { useConnectionStatus } from "../lib/state/connection-status";
import {
  useOpsHistoryMutation,
  useOpsMutation,
  useTimelineQuery,
} from "../lib/data/hooks";
import { ClipProperties } from "./ClipProperties";
import { IconRail } from "./IconRail";
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
  const [knownBranches, setKnownBranches] = useState<string[]>(["main"]);
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
  const [redoStack, setRedoStack] = useState<PendingOp[]>([]);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const timeline = useTimelineQuery(currentBranch);
  const opsMutation = useOpsMutation(currentBranch);
  const historyMutation = useOpsHistoryMutation(currentBranch);
  const editingPaused = useConnectionStatus().lost;

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
    setRedoStack([]);
  }, []);

  const addBranch = useCallback((branch: string) => {
    setKnownBranches((prev) =>
      prev.includes(branch) ? prev : [...prev, branch],
    );
  }, []);

  const resetToFreshDemo = useCallback(() => {
    setKnownBranches(["main"]);
    setCurrentBranch("main");
    setSelectedClipId(null);
    setPlayheadFrame(0);
    setRedoStack([]);
  }, []);

  const selectedClip = useMemo(() => {
    if (!selectedClipId || !timeline.data) return null;
    return findClipById(timeline.data.timeline, selectedClipId) ?? null;
  }, [selectedClipId, timeline.data]);

  // A clip that no longer exists (deleted, or split into new ids) cannot
  // stay selected — the panel would otherwise render stale/undefined data.
  useEffect(() => {
    if (selectedClipId && timeline.data && !selectedClip) {
      setSelectedClipId(null);
    }
  }, [selectedClipId, selectedClip, timeline.data]);

  const mediaRef = useMemo(() => {
    if (!selectedClip || !timeline.data) return undefined;
    if ("textContent" in selectedClip) return undefined;
    return findMediaRef(timeline.data.timeline, selectedClip.mediaRefId);
  }, [selectedClip, timeline.data]);

  const rate = timeline.data?.timeline.projectRate ?? 1;

  const emit = useCallback(
    (command: Command, options?: { onError?: () => void }) => {
      if (editingPaused) return; // C6: editing paused while connection is lost
      setRedoStack([]);
      opsMutation.mutate(command, options);
    },
    [editingPaused, opsMutation],
  );

  const handleUndo = useCallback(() => {
    if (editingPaused || historyMutation.isPending) return;
    historyMutation.mutate(
      { action: "undo" },
      {
        onSuccess: (result) => {
          if (result.operation) {
            setRedoStack((current) => [...current, result.operation!]);
          }
        },
      },
    );
  }, [editingPaused, historyMutation]);

  const handleRedo = useCallback(() => {
    if (editingPaused || historyMutation.isPending) return;
    const operation = redoStack.at(-1);
    if (!operation) return;
    historyMutation.mutate(
      { action: "redo", operation },
      {
        onSuccess: (result) => {
          if (!result.noChange) {
            setRedoStack((current) => current.slice(0, -1));
          }
        },
      },
    );
  }, [editingPaused, historyMutation, redoStack]);

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
      const shortcut = e.ctrlKey || e.metaKey;
      if (shortcut && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (shortcut && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
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
    selectedClip,
    selectedClipId,
    playheadFrame,
    handleDelete,
    handleRedo,
    handleRippleDelete,
    handleSplit,
    handleUndo,
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
      <TopBar
        currentBranch={currentBranch}
        knownBranches={knownBranches}
        pendingCount={data.pendingCount}
        canUndo={data.pendingCount > 0}
        canRedo={redoStack.length > 0}
        historyBusy={historyMutation.isPending}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onChangesClick={() => {
          setView("changes");
          setRightPanelMode("versioning");
        }}
        onBranchChanged={switchToBranch}
        onBranchAdded={addBranch}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
        <IconRail
          view={view}
          versioningOpen={rightPanelMode === "versioning"}
          currentBranch={currentBranch}
          pendingCount={data.pendingCount}
          onViewChange={setView}
          onBranchTouched={addBranch}
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
                  knownBranches={knownBranches}
                  pendingCount={data.pendingCount}
                  onHighlightClip={setHighlightedClipId}
                  onBranchTouched={addBranch}
                  hasInspector={Boolean(selectedClip)}
                  onCloseToInspector={() => setRightPanelMode("inspector")}
                />
              ) : (
                <ClipProperties
                  clip={selectedClip}
                  displayName={clipLabel(selectedClip, mediaRef)}
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
              timeline={data.timeline}
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
            />
          </div>
        </div>
      </div>
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
