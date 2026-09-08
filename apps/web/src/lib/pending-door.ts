/**
 * pending-door.ts — the Agent panel's parked door and its request token.
 *
 * I1(3)/(4): `View` and `Bring into main` start a cut switch and want a door
 * (Compare, or the Bring-in preview) opened AFTER that switch has landed.
 * Shell parks the door here and applies it from the effect that sees the new
 * cut — the `currentBranch` effects would wipe a door opened any earlier.
 *
 * The SEQUENCE is the second half. Every `park` mints a new number and every
 * `clear` burns the current one, so a switch that answers late can ask
 * "is the door I parked still the door?" before it navigates. A newer
 * intent — a second Agent click, or a manual Cut-menu switch — therefore
 * makes the older answer a no-op instead of a surprise navigation.
 *
 * Framework-free on purpose: no React, so the sequencing is unit-testable
 * on its own (`tests/pending-door.test.ts`).
 */

/**
 * `target` is the cut the editor must be STANDING on; a bring-in also
 * carries `from`, the cut being brought in, which is a different cut.
 */
export type PendingDoor =
  | { kind: "compare"; target: string; pair: { a: string; b: string } }
  | { kind: "bring-in"; target: string; from: string };

export type PendingDoorSlot = {
  /** Park a door, replacing any older one. Returns this request's token. */
  park: (door: PendingDoor) => number;
  /** Is `seq` still the newest intent? A stale answer must do NOTHING. */
  isCurrent: (seq: number) => boolean;
  /** The parked door, or null. */
  peek: () => PendingDoor | null;
  /** Drop the door AND burn the token: whatever is in flight is now stale. */
  clear: () => void;
};

export function createPendingDoorSlot(): PendingDoorSlot {
  let door: PendingDoor | null = null;
  // 0 is nobody's token: the first `park` hands out 1.
  let seq = 0;
  return {
    park(next: PendingDoor): number {
      door = next;
      seq += 1;
      return seq;
    },
    isCurrent(candidate: number): boolean {
      return candidate !== 0 && candidate === seq;
    },
    peek(): PendingDoor | null {
      return door;
    },
    clear(): void {
      door = null;
      seq += 1;
    },
  };
}
