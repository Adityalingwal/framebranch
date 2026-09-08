/**
 * B4a fix 1(b) — the parked Agent door's request token.
 *
 * The rule the Shell relies on: a branch-switch answer may only navigate if
 * the door it parked is STILL the newest intent. A second Agent click or a
 * manual Cut-menu switch replaces (or clears) it, and the older answer must
 * then do nothing at all — that is what keeps a slow answer from landing the
 * user on a cut they have since left.
 */

import { describe, expect, it } from "vitest";

import { createPendingDoorSlot } from "../src/lib/pending-door";
import type { PendingDoor } from "../src/lib/pending-door";

const compareDoor: PendingDoor = {
  kind: "compare",
  target: "agent-tighten-intro",
  pair: { a: "c1", b: "c2" },
};
const bringInDoor: PendingDoor = {
  kind: "bring-in",
  target: "main",
  from: "agent-add-captions",
};

describe("pending-door — one door, one token", () => {
  it("a fresh slot holds nothing and nobody's token is current", () => {
    const doors = createPendingDoorSlot();
    expect(doors.peek()).toBeNull();
    expect(doors.isCurrent(0)).toBe(false);
    expect(doors.isCurrent(1)).toBe(false);
  });

  it("the door just parked is the one that is current", () => {
    const doors = createPendingDoorSlot();
    const seq = doors.park(compareDoor);
    expect(doors.peek()).toEqual(compareDoor);
    expect(doors.isCurrent(seq)).toBe(true);
  });

  it("a second park replaces the door and makes the first answer a no-op", () => {
    const doors = createPendingDoorSlot();
    const first = doors.park(compareDoor);
    const second = doors.park(bringInDoor);

    expect(first).not.toBe(second);
    expect(doors.isCurrent(first)).toBe(false);
    expect(doors.isCurrent(second)).toBe(true);
    expect(doors.peek()).toEqual(bringInDoor);
  });

  it("clear drops the door AND burns the token — a manual cut switch wins", () => {
    const doors = createPendingDoorSlot();
    const seq = doors.park(compareDoor);
    doors.clear();

    expect(doors.peek()).toBeNull();
    // The switch this token belongs to is still in flight; when it answers
    // it must not navigate, because the user has since asked for elsewhere.
    expect(doors.isCurrent(seq)).toBe(false);
  });

  it("a token stays dead after the slot is reused", () => {
    const doors = createPendingDoorSlot();
    const stale = doors.park(compareDoor);
    doors.clear();
    const fresh = doors.park(bringInDoor);

    expect(doors.isCurrent(stale)).toBe(false);
    expect(doors.isCurrent(fresh)).toBe(true);
  });

  it("two slots keep their own sequences", () => {
    const a = createPendingDoorSlot();
    const b = createPendingDoorSlot();
    const seqA = a.park(compareDoor);
    b.park(bringInDoor);

    expect(a.isCurrent(seqA)).toBe(true);
    expect(a.peek()).toEqual(compareDoor);
    expect(b.peek()).toEqual(bringInDoor);
  });
});
