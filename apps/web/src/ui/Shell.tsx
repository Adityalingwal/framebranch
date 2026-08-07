"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Command, PropertyValue } from "@framebranch/engine";

import { ApiClientError } from "../lib/data/api-client";
import { findClipById, findMediaRef } from "../lib/clip-helpers";
import { useConnectionStatus } from "../lib/state/connection-status";
import { useOpsMutation, useTimelineQuery } from "../lib/data/hooks";
import { ClipProperties } from "./ClipProperties";
import { IconRail } from "./IconRail";
import { PreviewPane } from "./PreviewPane";
import { RightPanel, type PanelView } from "./RightPanel/RightPanel";
import { TimelineView } from "./Timeline/TimelineView";
import { TopBar } from "./TopBar";

const VALID_VIEWS: PanelView[] = ["changes", "merge", "history"];

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

  const timeline = useTimelineQuery(currentBranch);
  const opsMutation = useOpsMutation(currentBranch);
  const editingPaused = useConnectionStatus().lost;

  const setView = useCallback(
    (next: PanelView) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const switchToBranch = useCallback((branch: string) => {
    setCurrentBranch(branch);
    setSelectedClipId(null);
    setPlayheadFrame(0);
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
      opsMutation.mutate(command, options);
    },
    [editingPaused, opsMutation],
  );

  // Bumped whenever a propertyChange is rejected, so ClipProperties can
  // remount its local-state controls back to the authoritative clip value —
  // a rejection that doesn't change the clip's data (rollback = the value
  // it already was) never fires the controls' own "value changed" re-sync,
  // so without this an out-of-range/rejected input stays stuck on screen.
  const [propertyErrorTick, setPropertyErrorTick] = useState(0);

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
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedClipId) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      handleDelete(selectedClipId);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedClipId, handleDelete]);

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
        background: "var(--fb-page)",
        overflow: "hidden",
      }}
    >
      <TopBar
        currentBranch={currentBranch}
        knownBranches={knownBranches}
        pendingCount={data.pendingCount}
        onBranchChanged={switchToBranch}
        onBranchAdded={addBranch}
        onDemoReset={resetToFreshDemo}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
        <IconRail />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
            padding: 12,
            gap: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              gap: 12,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <div
              style={{
                flex: "1 1 60%",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minHeight: 0,
                minWidth: 0,
                overflowY: "auto",
              }}
            >
              <PreviewPane clip={selectedClip} mediaRef={mediaRef} />
              <ClipProperties
                clip={selectedClip}
                playheadFrame={playheadFrame}
                disabled={editingPaused}
                resetToken={propertyErrorTick}
                onPropertyChange={handlePropertyChange}
                onDelete={handleDelete}
                onRippleDelete={handleRippleDelete}
                onSplit={handleSplit}
              />
            </div>
            <div style={{ flex: "0 0 320px", minHeight: 0, minWidth: 0 }}>
              <RightPanel
                view={view}
                onViewChange={setView}
                currentBranch={currentBranch}
                knownBranches={knownBranches}
                pendingCount={data.pendingCount}
                onHighlightClip={setHighlightedClipId}
                onBranchTouched={addBranch}
              />
            </div>
          </div>
          <div
            className="surface-lg"
            style={{ flexShrink: 0, minWidth: 0, overflow: "hidden" }}
          >
            <TimelineView
              timeline={data.timeline}
              selectedClipId={selectedClipId}
              highlightedClipId={highlightedClipId}
              playheadFrame={playheadFrame}
              onSelectClip={(clip: { id: string }) =>
                setSelectedClipId(clip.id)
              }
              onSetPlayhead={setPlayheadFrame}
              onMove={handleMove}
              onTrim={handleTrim}
              onSlip={handleSlip}
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
        background: "var(--fb-page)",
      }}
    >
      {children}
    </div>
  );
}
