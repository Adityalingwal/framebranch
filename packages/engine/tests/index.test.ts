import { describe, expect, it } from "vitest";

// M1 skeleton sanity: the engine entry module imports cleanly.
describe("M1: repo skeleton", () => {
  it("engine public entry module imports cleanly", async () => {
    const mod = await import("../src/index");
    expect(mod).toBeDefined();
  });
});
