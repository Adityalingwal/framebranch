"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Track } from "@framebranch/engine";

import { ApiClientError } from "../lib/api-client";
import type { AnyClip } from "../lib/clip-helpers";
import { findMediaRef } from "../lib/clip-helpers";
import { useTimelineQuery } from "../lib/hooks";
import { ClipProperties } from "./ClipProperties";
import { IconRail } from "./IconRail";
import { PreviewPane } from "./PreviewPane";
import { RightPanel, type PanelView } from "./RightPanel/RightPanel";
import { TimelineView } from "./Timeline/TimelineView";
import { TopBar } from "./TopBar";

const VALID_VIEWS: PanelView[] = ["changes", "merge", "history"];

function parseView(raw: string | null): PanelView {
  return VALID_VIEWS.includes(raw as PanelView) ? (raw as PanelView) : "history";
}

export function Shell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = parseView(searchParams.get("view"));

  const [currentBranch, setCurrentBranch] = useState("main");
  const [knownBranches, setKnownBranches] = useState<string[]>(["main"]);
  const [selected, setSelected] = useState<{ clip: AnyClip; track: Track } | null>(
    null,
  );

  const timeline = useTimelineQuery(currentBranch);

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
    setSelected(null);
  }, []);

  const addBranch = useCallback((branch: string) => {
    setKnownBranches((prev) => (prev.includes(branch) ? prev : [...prev, branch]));
  }, []);

  const resetToFreshDemo = useCallback(() => {
    setKnownBranches(["main"]);
    setCurrentBranch("main");
    setSelected(null);
  }, []);

  const mediaRef = useMemo(() => {
    if (!selected || !timeline.data) return undefined;
    if ("textContent" in selected.clip) return undefined;
    return findMediaRef(timeline.data.timeline, selected.clip.mediaRefId);
  }, [selected, timeline.data]);

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
            style={{ flex: 1, display: "flex", gap: 12, minHeight: 0, minWidth: 0 }}
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
              <PreviewPane clip={selected?.clip ?? null} mediaRef={mediaRef} />
              <ClipProperties clip={selected?.clip ?? null} />
            </div>
            <div style={{ flex: "0 0 320px", minHeight: 0, minWidth: 0 }}>
              <RightPanel view={view} onViewChange={setView} currentBranch={currentBranch} />
            </div>
          </div>
          <div className="surface-lg" style={{ flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
            <TimelineView
              timeline={data.timeline}
              selectedClipId={selected?.clip.id ?? null}
              onSelectClip={(clip, track) => setSelected({ clip, track })}
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
