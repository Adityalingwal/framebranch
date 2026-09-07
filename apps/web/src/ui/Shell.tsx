"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import type {
  Command,
  MergeChoice,
  PropertyValue,
  Track,
} from "@framebranch/engine";
import { ArrowsInLineHorizontal, Scissors, Trash } from "@phosphor-icons/react";

import type { DiffRow } from "../server/diff-rows";
import { ApiClientError } from "../lib/data/api-client";
import type { BringInToken } from "../lib/data/api-client";
import { queryKeys } from "../lib/data/query-keys";
import {
  choicesKeyFor,
  clearChoices,
  parseChoices,
  setChoice,
  useBringInChoicesRaw,
} from "../lib/state/bring-in-choices";
import type { ConflictLine } from "../server/conflict-cards";
import { clipDisplayName, findClipById, findMediaRef } from "../lib/clip-helpers";
import { quoted } from "../lib/format";
import { useConnectionStatus } from "../lib/state/connection-status";
import { NOW_SIDE } from "../lib/data/api-client";
import { showToast } from "../lib/state/toast-status";
import {
  useBranchesQuery,
  useBringInMutation,
  useBringInPreviewQuery,
  useCompareQuery,
  useDiffQuery,
  useHistoryQuery,
  useOpsMutation,
  useRestoreMutation,
  useTimelineAtQuery,
  useTimelineQuery,
} from "../lib/data/hooks";
import { ClipProperties } from "./ClipProperties";
import { CompareLanes } from "./Compare/CompareLanes";
import { ComparePlayer } from "./Compare/ComparePlayer";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconRail } from "./IconRail";
import { NameGate } from "./NameGate";
import { PreviewPane } from "./PreviewPane";
import { RightPanel, type PanelView } from "./RightPanel/RightPanel";
import { TimelineView } from "./Timeline/TimelineView";
import { TopBar } from "./TopBar";

const VALID_VIEWS: PanelView[] = ["changes", "history"];
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
  // B2 §2.4 — one row can touch many clips (a ripple, a split), so the
  // highlight is a LIST. There is exactly one highlight mechanism in the
  // app and it belongs to Compare; the editing timeline has none.
  const [highlightedClipIds, setHighlightedClipIds] = useState<string[]>([]);
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
  // F5 — `Cancel — nothing changes` always asks first, even with no
  // decisions made: one path, no special case.
  const [cancelBringInOpen, setCancelBringInOpen] = useState(false);
  // B2 §2.4 — the two points being compared. It lives HERE, not in the
  // panel, because three different doors set it and the lanes (centre) and
  // the rows (right) must read the same pair. Values are commit ids or
  // `NOW_SIDE`; the ORDER never matters (D4(12) — the server says which is
  // older and the view always reads older → newer).
  const [comparePair, setComparePair] = useState<{
    a: string;
    b: string;
  } | null>(null);
  // B2 §2.7 — which side the player is showing and which clip it is
  // focused on. Compare-only; cleared on the way in and on the way out.
  const [compareFocus, setCompareFocus] = useState<{
    side: "before" | "after";
    clipId: string | null;
  } | null>(null);
  /**
   * B3 §2.5 — the Bring-in door. `token` is captured from the FIRST preview
   * answer and then FROZEN: later choice-refetches return their own token,
   * which is ignored. F4 says drift is caught ONCE, at `Bring in now`, with
   * the patti — an edit on main between two button clicks must not silently
   * orphan the decisions the user has already made. Only `Start again`
   * drops it (and captures the next answer's).
   */
  const [bringIn, setBringIn] = useState<{
    cut: string;
    token: BringInToken | null;
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const timeline = useTimelineQuery(currentBranch);
  const opsMutation = useOpsMutation(currentBranch);
  const connectionLost = useConnectionStatus().lost;
  // B5-1 / B5 IMPL-NOTE (b): while a card is being viewed the editor is
  // read-only, exactly as it is while the connection is lost. ONE derived
  // flag drives every consumer that used to read the connection store on
  // its own, so nothing can be locked in one place and live in another.
  //
  // B2 lock (1): Compare is read-only too, and it is the SAME flag — every
  // consumer B1 wired (top bar Mark / Cut menu, rail, Merge panel, the
  // keyboard) is locked by it with no new wiring.
  //
  // `compareOpen` is derived from the URL param ALONE. Adding
  // `rightPanelMode` to the condition would allow a `changes + inspector`
  // state where the lanes are hidden but editing is unlocked.
  const compareOpen = view === "changes";
  const editingPaused = connectionLost || viewing !== null || compareOpen;

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

  // ---- B2: the Compare pair, and the ONE query behind lanes + rows ------

  // (i) A commit id means nothing on another cut's chain. This is an effect
  // on `currentBranch` rather than a line inside `switchToBranch` because
  // `resetToFreshDemo` sets the cut directly and would otherwise miss it.
  useEffect(() => {
    setComparePair(null);
    // Exit (iii): a preview belongs to `main` and to one cut; standing
    // somewhere else ends it.
    setBringIn(null);
  }, [currentBranch]);

  // (i-b) …and clearing on a cut change is not enough on its own. A demo
  // reset while already on `main` never changes `currentBranch`, so the
  // effect above fires with the OLD cut's History still cached: the default
  // below immediately refills the pair with a commit the reset has just
  // deleted, and nothing ever clears it again ("Couldn't load these
  // changes." on the Changes tab). So the pair is also checked against the
  // SETTLED History chain: a side that names a commit no longer on it goes.
  useEffect(() => {
    if (comparePair === null) return;
    if (!history.isSuccess || history.isFetching) return;
    const known = (ref: string) =>
      ref === NOW_SIDE ||
      historyCommits.some((commit) => commit.commitId === ref);
    // The branch list and History are invalidated together but land in
    // either order. Only judge the pair once the chain agrees with the head
    // the default would use — otherwise clearing and re-defaulting could
    // chase each other while the two are out of step.
    if (head === null || !known(head)) return;
    if (known(comparePair.a) && known(comparePair.b)) return;
    setComparePair(null);
  }, [
    comparePair,
    head,
    history.isSuccess,
    history.isFetching,
    historyCommits,
  ]);

  // (ii) D3a — the default pair, applied as soon as the head is known:
  // `head → Now`, which is exactly what the top-bar chip counts. Only ever
  // fills a null pair, so the user's own picks are never overwritten.
  useEffect(() => {
    if (comparePair !== null || head === null) return;
    setComparePair({ a: head, b: NOW_SIDE });
  }, [comparePair, head]);

  // Lanes and rows come from ONE snapshot (lock (4)); its key is a child of
  // `diffAll(cut)`, so an edit refreshes both together.
  // Fetched ONLY while Compare is open: `timelines=1` carries both full
  // timelines, and the chip's own light query already covers head → Now on
  // every other screen. Reopening fetches the (possibly invalidated) snapshot.
  // The Bring-in preview is the THIRD door into this same view, so the
  // normal Compare query stands down while it is open (its answer would be
  // a different pair of the same cut, fetched for nothing).
  const compare = useCompareQuery(
    currentBranch,
    compareOpen && bringIn === null ? (comparePair?.a ?? null) : null,
    compareOpen && bringIn === null ? (comparePair?.b ?? null) : null,
  );

  // ---- B3: the Bring-in preview ------------------------------------------

  const previewOpen = compareOpen && bringIn !== null;
  // The key is the FROZEN token (§2.4): a new token means a new set of
  // decisions, so `Start again` leaves the old ones behind by itself.
  const choicesKey = choicesKeyFor(bringIn?.cut ?? "", bringIn?.token ?? null);
  // The store's snapshot is the raw JSON string — stable between renders,
  // and exactly what the query key needs.
  const choicesRaw = useBringInChoicesRaw(choicesKey);
  const choices = useMemo(() => parseChoices(choicesRaw), [choicesRaw]);
  const preview = useBringInPreviewQuery(
    bringIn?.cut ?? null,
    choices,
    choicesRaw,
    previewOpen,
  );
  const bringInMutation = useBringInMutation();

  // Freeze the token on the first REAL answer (never on `keepPreviousData`'s
  // placeholder, which is the previous request's body).
  useEffect(() => {
    if (!previewOpen || preview.isPlaceholderData) return;
    const token = preview.data?.token;
    if (!token) return;
    setBringIn((current) =>
      current && current.token === null ? { ...current, token } : current,
    );
  }, [previewOpen, preview.data, preview.isPlaceholderData]);

  /** Lanes, rows and the player read ONE source, whichever door is open. */
  const laneData = bringIn !== null ? preview.data : compare.data;

  /**
   * B2 lock (3) — a row click sends the player exactly where the row's own
   * last timecode says the clip now is. The presenter already worked all of
   * this out (`jump`); the Shell only obeys it.
   */
  const handleRowClick = useCallback((row: DiffRow) => {
    setCompareFocus({ side: row.jump.side, clipId: row.jump.clipId });
    setPlayheadFrame(row.jump.frame);
  }, []);

  /**
   * §2.6 — clicking a clip in a lane: the player focuses that clip on that
   * side and the playhead goes to the clip's start THERE (the same clip can
   * sit at two different positions on the two sides).
   */
  const handleCompareClipClick = useCallback(
    (side: "before" | "after", clipId: string) => {
      const lane = side === "before" ? laneData?.before : laneData?.after;
      setCompareFocus({ side, clipId });
      const clip = lane ? findClipById(lane, clipId) : undefined;
      if (clip) setPlayheadFrame(clip.timelineRange.start.value);
    },
    [laneData?.before, laneData?.after],
  );

  /**
   * Entering Compare (any door, and on load with `?view=changes`): the clip
   * selection goes — a stale selection would flip the right column to
   * ClipProperties and hide the very panel Compare lives in — and the
   * playhead and the player focus start clean. Leaving clears the focus
   * again, the same way ✕ leaves View.
   */
  // Exit (i): any tab switch away from Changes ends the preview. The deps
  // are `compareOpen` ALONE — the door sets `bringIn` before the URL catches
  // up, and reacting to that would close the door it has just opened.
  useEffect(() => {
    if (!compareOpen) setBringIn(null);
  }, [compareOpen]);

  useEffect(() => {
    setCompareFocus(null);
    setPlayheadFrame(0);
    if (!compareOpen) return;
    setSelectedClipId(null);
    setRightPanelMode("versioning");
  }, [compareOpen]);

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

  /**
   * B2 §2.4 (iii) / lock (5) — a DOOR into Compare carries its own pair and
   * wins over both the default and the user's last picks. The three doors:
   * the top-bar chip and the rail's Changes item (`head → Now`, D4(11)), and
   * the View bar's Compare button (`the viewed card → Now`). Clicking the
   * Changes TAB is NOT a door: it leaves the pair exactly as it was.
   */
  const openCompare = useCallback(
    (pair: { a: string; b: string } | null) => {
      setComparePair(pair);
      setView("changes");
      setRightPanelMode("versioning");
    },
    [setView],
  );

  /** The Changes door: always the head card against Now (D2, D4(11)). */
  const openChangesDoor = useCallback(() => {
    // Exit (ii): the chip and the rail's Changes item are the head→Now door.
    // Under the preview the chip is the `Comparing` pill, so this is a guard.
    setBringIn(null);
    openCompare(head !== null ? { a: head, b: NOW_SIDE } : null);
  }, [openCompare, head]);

  /**
   * §2.5 — the Bring-in door. Deliberately NOT in the URL: a reload on
   * `?view=changes` opens the normal Compare, not this preview. The
   * decisions in sessionStorage survive for a later re-open with the same
   * token.
   *
   * The cached answer is dropped first: `staleTime: Infinity` would
   * otherwise hand back an older body and the token would be frozen from a
   * screen that has since moved on.
   */
  const openBringIn = useCallback(
    (cut: string) => {
      queryClient.removeQueries({ queryKey: queryKeys.bringInAll() });
      setBringIn({ cut, token: null });
      setView("changes");
      setRightPanelMode("versioning");
    },
    [queryClient, setView],
  );

  /**
   * F4 — `Start again`: a fresh preview and a fresh token, so the decisions
   * are re-asked. Nothing deletes them; the choices key simply moves with
   * the token.
   */
  const restartBringIn = useCallback(() => {
    queryClient.removeQueries({ queryKey: queryKeys.bringInAll() });
    bringInMutation.reset();
    setBringIn((current) =>
      current ? { cut: current.cut, token: null } : current,
    );
  }, [queryClient, bringInMutation]);

  /** A decision: stored, then the (stateless) preview is simply re-asked. */
  const handleChoice = useCallback(
    (conflictId: string, choice: MergeChoice) => {
      if (choicesKey === "") return; // no token yet: nothing to key them by
      setChoice(choicesKey, conflictId, choice);
    },
    [choicesKey],
  );

  /**
   * F3(3) — a card's line behaves like a row: it sends the player to that
   * clip on that side. The Original line has no lane and no jump, so the
   * panel never calls this for it.
   */
  const handleLineClick = useCallback((line: ConflictLine) => {
    if (!line.jump) return;
    setCompareFocus({ side: line.jump.side, clipId: line.clipId });
    setPlayheadFrame(line.jump.frame);
  }, []);

  /** Exit (iv) — F5 / C-2: the preview wrote nothing, so this is the truth. */
  const cancelBringIn = useCallback(() => {
    clearChoices(choicesKey);
    queryClient.removeQueries({ queryKey: queryKeys.bringInAll() });
    bringInMutation.reset();
    setBringIn(null);
    setCancelBringInOpen(false);
    setView("history");
    showToast("Cancelled — main is unchanged.");
  }, [choicesKey, queryClient, bringInMutation, setView]);

  /** Exit (v) — the landing. The new card is at the top of History. */
  const landBringIn = useCallback(() => {
    if (!bringIn?.token) return;
    const cut = bringIn.cut;
    const key = choicesKey;
    bringInMutation.mutate(
      { from: cut, token: bringIn.token, choices },
      {
        onSuccess: () => {
          clearChoices(key);
          queryClient.removeQueries({ queryKey: queryKeys.bringInAll() });
          setBringIn(null);
          setView("history");
          showToast(`Brought ${quoted(cut)} into main.`);
        },
      },
    );
  }, [bringIn, choices, choicesKey, bringInMutation, queryClient, setView]);

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
    // Already on `main` → the cut-change effect would not fire, and the
    // pair would keep pointing at commits the reset just deleted.
    setComparePair(null);
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

  /**
   * B2 §2.6 (#111, #112) — the lane names. They are PARAMETERS, not baked
   * into the lanes, because B3's Bring-in door passes different text
   * through the same view (D4(11)). Which pick is older comes from the
   * server (`older`), never from the order the user picked them in.
   */
  const laneLabels = useMemo(() => {
    // #132 — the Bring-in door names the two lanes for what they are: main
    // as it stands, and main with this cut in it.
    if (bringIn) {
      return {
        before: "main now",
        after: `main with ${quoted(bringIn.cut)}`,
      };
    }
    if (!comparePair) return { before: "", after: "" };
    const [olderRef, newerRef] =
      compare.data?.older === "b"
        ? [comparePair.b, comparePair.a]
        : [comparePair.a, comparePair.b];
    const nameOf = (ref: string) => {
      if (ref === NOW_SIDE) return "Now";
      const card = historyCommits.find((c) => c.commitId === ref);
      return card ? quoted(card.name) : "";
    };
    return { before: nameOf(olderRef), after: nameOf(newerRef) };
  }, [bringIn, comparePair, compare.data?.older, historyCommits]);

  const emit = useCallback(
    (command: Command, options?: { onError?: () => void }) => {
      // ONE funnel: every edit verb (add/move/trim/slip/split/delete/
      // ripple-delete/property/replaceTracks) comes through here, so this
      // is the only place the read-only states have to be enforced.
      //
      // Compare first, and SILENTLY: the lanes are not an editing surface,
      // there is no copy-sheet string for "you can't edit here", and the
      // editing timeline is unmounted under Compare — so this is a guard,
      // not a path anyone can walk.
      if (compareOpen) return;
      if (viewing !== null) {
        showToast("You're viewing an old version. Close it to edit.");
        return;
      }
      if (connectionLost) return; // C6: editing paused while the connection is lost
      opsMutation.mutate(command, options);
    },
    [compareOpen, connectionLost, viewing, opsMutation],
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
        comparing={compareOpen}
        onChangesClick={openChangesDoor}
        onBranchChanged={switchToBranch}
        onBringIn={openBringIn}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
        <IconRail
          view={view}
          versioningOpen={rightPanelMode === "versioning"}
          currentBranch={currentBranch}
          changesCount={changesCount}
          editingLocked={editingPaused}
          // Lock (5): the rail's Changes item IS the Changes door, so it
          // resets the pair to `head → Now` every time. History is a plain
          // tab switch.
          onViewChange={(next) =>
            next === "changes" ? openChangesDoor() : setView(next)
          }
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
              {/* B2 §2.7 — under Compare the preview column belongs to the
                  Compare player; the editor's own preview is not rendered
                  at all. Until the one query answers there is nothing to
                  show, and no text either (§2.4). */}
              {compareOpen ? (
                laneData?.before && laneData.after ? (
                  <ComparePlayer
                    before={laneData.before}
                    after={laneData.after}
                    focus={compareFocus}
                    playheadFrame={playheadFrame}
                    onSetPlayhead={setPlayheadFrame}
                    onSideChange={(side) =>
                      setCompareFocus((current) => ({
                        side,
                        clipId: current?.clipId ?? null,
                      }))
                    }
                  />
                ) : null
              ) : (
                <PreviewPane
                  clip={selectedClip}
                  mediaRef={mediaRef}
                  playheadFrame={playheadFrame}
                  projectRate={rate}
                  onSetPlayhead={setPlayheadFrame}
                />
              )}
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
                  commits={historyCommits}
                  comparePair={comparePair}
                  historyEmpty={history.isSuccess && historyCommits.length === 0}
                  onComparePairChange={setComparePair}
                  compare={compare}
                  highlightedClipIds={highlightedClipIds}
                  onHighlightClip={setHighlightedClipIds}
                  onRowClick={handleRowClick}
                  onViewCard={openView}
                  bringIn={bringIn}
                  preview={preview}
                  landPending={bringInMutation.isPending}
                  landError={bringInMutation.error}
                  onChoice={handleChoice}
                  onLand={landBringIn}
                  onCancelBringIn={() => setCancelBringInOpen(true)}
                  onStartAgain={restartBringIn}
                  onLineClick={handleLineClick}
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
                the card you are standing on); Compare always shows.

                B2 lock (1): while Compare is open the whole editing centre
                — this bar, the clip toolbar and the timeline — is replaced
                by the two lanes. Closing Compare brings back exactly what
                was underneath, View mode included. */}
            {!compareOpen && viewing && (
              <div className="view-bar" aria-label="Viewing an old version">
                <span className="view-bar-text">
                  {`Viewing ${quoted(viewing.name)}`}
                </span>
                <span className="view-bar-actions">
                  <button
                    type="button"
                    className="view-bar-button"
                    onClick={() =>
                      openCompare({ a: viewing.commitId, b: NOW_SIDE })
                    }
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
            {!compareOpen &&
              selectedClip &&
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
            {compareOpen ? (
              laneData?.before && laneData.after ? (
                <CompareLanes
                  before={laneData.before}
                  after={laneData.after}
                  beforeLabel={laneLabels.before}
                  afterLabel={laneLabels.after}
                  rows={laneData.rows}
                  undecidedClipIds={
                    bringIn !== null ? preview.data?.undecidedClipIds : undefined
                  }
                  playheadFrame={playheadFrame}
                  onSetPlayhead={setPlayheadFrame}
                  highlightedClipIds={highlightedClipIds}
                  onHighlightClip={setHighlightedClipIds}
                  onClipClick={handleCompareClipClick}
                />
              ) : null
            ) : (
              <TimelineView
                timeline={displayedTimeline ?? data.timeline}
                selectedClipId={selectedClipId}
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
                  const clipEnd =
                    clipStart + clip.timelineRange.duration.value;
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
            )}
          </div>
        </div>
      </div>

      {/* B5-2b (#90-#92) — the box says all three things the lock demands:
          a new version goes ON TOP, the edits since the current card are
          kept, nothing is deleted. The middle sentence appears only when
          there ARE such edits. */}
      {/* F5 / C-2 (#155-#157) — the words are true because the preview
          wrote nothing: the decisions are all there is to drop. The box
          shows even at zero decisions (one path, no special case). */}
      <ConfirmDialog
        open={cancelBringInOpen && bringIn !== null}
        onOpenChange={setCancelBringInOpen}
        title={`Stop bringing in ${quoted(bringIn?.cut ?? "")}?`}
        description="Your decisions so far are dropped. main stays exactly as it is."
        confirmLabel="Yes, cancel"
        cancelLabel="Keep going"
        tone="danger"
        onConfirm={cancelBringIn}
      />

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
