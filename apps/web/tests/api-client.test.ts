// Retry ladder and envelope/error mapping — global.fetch is mocked, timers are faked (retries run instantly).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  mutationErrorMessage,
  postBranch,
  postCommit,
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
    ).rejects.toMatchObject({ code: "E_BRANCH_EXISTS", message: "That name is taken." });

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
      postCommit({ branch: "main" }, noopHooks()),
    ).rejects.toBeInstanceOf(ApiClientError);
    await expect(
      postCommit({ branch: "main" }, noopHooks()),
    ).rejects.toMatchObject({ message: "clips would overlap" });
  });

  it("mutationErrorMessage: an ApiClientError's already-friendly message passes through; anything else is generic", () => {
    // review finding: mutation onError handlers use this to show a
    // toast — regression-guard the two cases it must handle.
    expect(
      mutationErrorMessage(new ApiClientError("E_BRANCH_EXISTS", "That name is taken.")),
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
        jsonResponse({ ok: true, data: { commitId: "c1", name: "Version 2" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const hooks = noopHooks();

    const resultPromise = postCommit({ branch: "main" }, hooks);
    await vi.advanceTimersByTimeAsync(1000); // first silent retry
    await vi.advanceTimersByTimeAsync(3000); // second silent retry
    const result = await resultPromise;

    expect(result).toEqual({ commitId: "c1", name: "Version 2" });
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
        jsonResponse({ ok: true, data: { commitId: "c1", name: "Version 2" } }),
      ); // manual [Retry] press
    vi.stubGlobal("fetch", fetchMock);

    let capturedRetry: (() => void) | null = null;
    const hooks: RetryHooks = {
      onConnectionLost: vi.fn((retry: () => void) => {
        capturedRetry = retry;
      }),
      onConnectionRestored: vi.fn(),
    };

    const resultPromise = postCommit({ branch: "main" }, hooks);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(hooks.onConnectionLost).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(hooks.onConnectionRestored).not.toHaveBeenCalled();

    // User presses [Retry] — same in-flight ticket, no new one minted.
    capturedRetry!();
    const result = await resultPromise;

    expect(result).toEqual({ commitId: "c1", name: "Version 2" });
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
    const assertion = expect(postCommit({ branch: "main" }, hooks)).rejects.toMatchObject({
      code: "E_STALE_HEAD",
      message: "This version moved — reload and try again.",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2); // no further retries after a real answer
    expect(hooks.onConnectionLost).not.toHaveBeenCalled();
  });
});
