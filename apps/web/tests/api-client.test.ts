// Retry ladder and envelope/error mapping — global.fetch is mocked, timers are faked (retries run instantly).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  deleteReady,
  EDITOR_NAME_HEADER,
  getAgentPresets,
  getPresets,
  mutationErrorMessage,
  postAgentRun,
  postBranch,
  postCommit,
  postProjectNew,
  postReady,
  postSync,
} from "../src/lib/data/api-client";
import type { RetryHooks } from "../src/lib/data/api-client";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function noopHooks(): RetryHooks {
  return {
    onConnectionLost: vi.fn(),
    onConnectionRestored: vi.fn(),
  };
}

function ticketOf(call: unknown[]): string {
  const init = call[1] as RequestInit;
  return (JSON.parse(init.body as string) as { ticket: string }).ticket;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // The editor-name cases stub `window`; nothing may leak into the next test.
  vi.unstubAllGlobals();
});

describe("api-client — envelope + error mapping", () => {
  it("a real {ok:false} envelope is an ANSWER: no retry, typed error, friendly message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: false,
        error: { code: "E_BRANCH_EXISTS", message: "duplicate key" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const hooks = noopHooks();

    await expect(
      postBranch({ name: "main", from: "main" }, hooks),
    ).rejects.toMatchObject({
      code: "E_BRANCH_EXISTS",
      message: "That name is taken.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // C6: an answer never retries
    expect(hooks.onConnectionLost).not.toHaveBeenCalled();
  });

  it("an unknown error code falls back to the server's own message, never a raw code", async () => {
    // A fresh Response per call — a Response body can only be read once,
    // and `mockResolvedValue` would otherwise hand out the SAME instance.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          ok: false,
          error: { code: "E_OVERLAP", message: "clips would overlap" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postCommit({ branch: "main", name: "Client pick" }, noopHooks()),
    ).rejects.toBeInstanceOf(ApiClientError);
    await expect(
      postCommit({ branch: "main", name: "Client pick" }, noopHooks()),
    ).rejects.toMatchObject({ message: "clips would overlap" });
  });

  it("mutationErrorMessage: an ApiClientError's already-friendly message passes through; anything else is generic", () => {
    // review finding: mutation onError handlers use this to show a
    // toast — regression-guard the two cases it must handle.
    expect(
      mutationErrorMessage(
        new ApiClientError("E_BRANCH_EXISTS", "That name is taken."),
      ),
    ).toBe("That name is taken.");
    expect(mutationErrorMessage(new Error("network exploded"))).toBe(
      "Something went wrong.",
    );
    expect(mutationErrorMessage("not even an Error")).toBe(
      "Something went wrong.",
    );
  });
});

describe("api-client — C6 retry ladder", () => {
  it("silent retries at 1s then 3s, same ticket every time, succeeds without a banner", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: { commitId: "c1", name: "Client pick" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hooks = noopHooks();

    const resultPromise = postCommit({ branch: "main", name: "Client pick" }, hooks);
    await vi.advanceTimersByTimeAsync(1000); // first silent retry
    await vi.advanceTimersByTimeAsync(3000); // second silent retry
    const result = await resultPromise;

    expect(result).toEqual({ commitId: "c1", name: "Client pick" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tickets = fetchMock.mock.calls.map(ticketOf);
    expect(new Set(tickets).size).toBe(1); // every retry reused the SAME ticket
    expect(hooks.onConnectionLost).not.toHaveBeenCalled();
  });

  it("after 2 silent retries fail, reports connection-lost; a manual retry (same ticket) resolves it", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error")) // first try
      .mockRejectedValueOnce(new TypeError("network error")) // silent retry @1s
      .mockRejectedValueOnce(new TypeError("network error")) // silent retry @3s
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: { commitId: "c1", name: "Client pick" } }),
      ); // manual [Retry] press
    vi.stubGlobal("fetch", fetchMock);

    let capturedRetry: (() => void) | null = null;
    const hooks: RetryHooks = {
      onConnectionLost: vi.fn((retry: () => void) => {
        capturedRetry = retry;
      }),
      onConnectionRestored: vi.fn(),
    };

    const resultPromise = postCommit({ branch: "main", name: "Client pick" }, hooks);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(hooks.onConnectionLost).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(hooks.onConnectionRestored).not.toHaveBeenCalled();

    // User presses [Retry] — same in-flight ticket, no new one minted.
    capturedRetry!();
    const result = await resultPromise;

    expect(result).toEqual({ commitId: "c1", name: "Client pick" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const tickets = fetchMock.mock.calls.map(ticketOf);
    expect(new Set(tickets).size).toBe(1);
    expect(hooks.onConnectionRestored).toHaveBeenCalledTimes(1);
  });

  it("a designed error (ok:false) reached mid-ladder stops the ladder immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: false,
          error: { code: "E_STALE_HEAD", message: "head moved" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hooks = noopHooks();

    // Attach the rejection handler BEFORE advancing timers, so the retry's
    // rejection (which lands mid-`advanceTimersByTimeAsync`) is never
    // briefly unhandled from Node's point of view.
    const assertion = expect(
      postCommit({ branch: "main", name: "Client pick" }, hooks),
    ).rejects.toMatchObject({
      code: "E_STALE_HEAD",
      message: "This cut changed in the meantime — try again.", // #200
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2); // no further retries after a real answer
    expect(hooks.onConnectionLost).not.toHaveBeenCalled();
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// B4a — the four functions I1/G1 added: URL, method, body shape, and the
// typed answer coming back out. The envelope/retry behaviour above is
// shared by every call; these pin down what each one actually sends.
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function callOf(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
} {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

/** F2a — the tab has been named, so mutations carry the header. */
function withEditorName(name: string): void {
  vi.stubGlobal("window", {
    sessionStorage: { getItem: () => name },
  });
}

describe("api-client — the Agent + project endpoints", () => {
  it("getAgentPresets: GET /api/agent/presets, and the presets come back typed", async () => {
    const data = {
      presets: [
        {
          id: "tighten-intro",
          name: "Tighten intro",
          description: "Trims the opening…",
          run: null,
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAgentPresets()).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/agent/presets");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined(); // a read sends nothing
  });

  it("getPresets: GET /api/presets, the picker's rows straight through", async () => {
    const data = {
      presets: [{ id: "travel-vlog", name: "Travel vlog", description: "…" }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPresets()).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/presets");
    expect(init.method).toBe("GET");
  });

  it("postAgentRun: POST /api/agent/run, body { preset, ticket }, with the editor's name", async () => {
    withEditorName("Priya");
    const data = {
      cut: "agent-tighten-intro",
      commitId: "c9",
      name: "Tighten intro",
      opsApplied: 4,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postAgentRun({ preset: "tighten-intro" }, noopHooks()),
    ).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/agent/run");
    expect(init.method).toBe("POST");
    // I1 patch (a): the browser sends the preset id and nothing else — the
    // server picks the cut.
    const body = bodyOf(init);
    expect(Object.keys(body).sort()).toEqual(["preset", "ticket"]);
    expect(body.preset).toBe("tighten-intro");
    expect(body.ticket).toMatch(UUID);
    expect(headerOf(init, EDITOR_NAME_HEADER)).toBe("Priya");
  });

  it("postProjectNew: POST /api/project/new, body { preset, ticket }; no name, no header", async () => {
    const data = {
      preset: { id: "thirty-second-ad", name: "30s ad" },
      branch: "main",
      head: "c1",
      timeline: { id: "t" },
      workingRev: 0,
      pendingCount: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postProjectNew({ preset: "thirty-second-ad" }, noopHooks()),
    ).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/project/new");
    expect(init.method).toBe("POST");
    const body = bodyOf(init);
    expect(Object.keys(body).sort()).toEqual(["preset", "ticket"]);
    expect(body.preset).toBe("thirty-second-ad");
    expect(body.ticket).toMatch(UUID);
    // This tab has never been named: the header is simply absent (B0
    // leniency — the server attributes the work to `Editor`).
    expect(headerOf(init, EDITOR_NAME_HEADER)).toBeUndefined();
  });
});

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// B4b — Ready (F3(4)) and the sync heartbeat (J1). The point of these three
// is the shape each one sends: which verb, which body, and — for the
// heartbeat — that it carries the name but NO ticket, because it is not a
// mutation anyone may replay.
// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

describe("api-client — Ready + sync", () => {
  it("postReady: POST /api/branch/ready, body { cut, note, ticket }, with the editor's name", async () => {
    withEditorName("Priya");
    const data = {
      cut: "priya-music",
      ready: {
        note: "Music bed + VO dip",
        by: "Priya",
        at: "2026-09-08T12:00:00.000Z",
        editedSince: false,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postReady(
        { cut: "priya-music", note: "Music bed + VO dip" },
        noopHooks(),
      ),
    ).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/branch/ready");
    expect(init.method).toBe("POST");
    const body = bodyOf(init);
    expect(Object.keys(body).sort()).toEqual(["cut", "note", "ticket"]);
    expect(body.cut).toBe("priya-music");
    expect(body.note).toBe("Music bed + VO dip");
    expect(body.ticket).toMatch(UUID);
    expect(headerOf(init, EDITOR_NAME_HEADER)).toBe("Priya");
  });

  it("deleteReady: the SAME url with DELETE, body { cut, ticket } — one resource, two verbs", async () => {
    withEditorName("Priya");
    const data = { cut: "priya-music", ready: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteReady({ cut: "priya-music" }, noopHooks()),
    ).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/branch/ready");
    expect(init.method).toBe("DELETE");
    const body = bodyOf(init);
    // There is no note to un-say, but the ticket stays: un-marking still
    // goes through the retry ladder, so it still has to be replay-safe.
    expect(Object.keys(body).sort()).toEqual(["cut", "ticket"]);
    expect(body.cut).toBe("priya-music");
    expect(body.ticket).toMatch(UUID);
    expect(headerOf(init, EDITOR_NAME_HEADER)).toBe("Priya");
  });

  it("postSync: POST /api/sync with the name header and NO ticket — a heartbeat is not a mutation", async () => {
    withEditorName("Aditya");
    const data = {
      cursor: 12,
      events: [],
      peers: [
        {
          tabId: "tab-b",
          name: "Priya",
          cut: "priya-music",
          playheadFrame: 120,
          colourSeed: 200,
          lastSeenAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = {
      tabId: "tab-aaaaaaaa",
      cut: "main",
      playheadFrame: 0,
      colourSeed: 10,
      cursor: null,
    };
    await expect(postSync(sent)).resolves.toEqual(data);

    const { url, init } = callOf(fetchMock);
    expect(url).toBe("/api/sync");
    expect(init.method).toBe("POST");
    expect(bodyOf(init)).toEqual(sent);
    expect(bodyOf(init).ticket).toBeUndefined();
    expect(headerOf(init, EDITOR_NAME_HEADER)).toBe("Aditya");
  });

  it("postSync stays OUT of the retry ladder: a network failure rejects at once", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network error"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postSync({
        tabId: "tab-aaaaaaaa",
        cut: "main",
        playheadFrame: 0,
        colourSeed: 10,
        cursor: 3,
      }),
    ).rejects.toBeInstanceOf(Error);

    // No 1s/3s silent retries, and no banner: the poller swallows this and
    // ticks again in 3 seconds.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
