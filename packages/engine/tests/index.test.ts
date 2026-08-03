import { describe, expect, it } from "vitest";

// M1 skeleton sanity: the engine entry module imports cleanly.
// Real tests (lock-ID prefixed, docs/12 T1) start in Milestone 2.
describe("M1: repo skeleton", () => {
  it("engine public entry module imports cleanly", async () => {
    const mod = await import("../src/index");
    expect(mod).toBeDefined();
  });
});
