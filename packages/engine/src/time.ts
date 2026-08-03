/**
 * time.ts — A1: rational time.
 *
 * A1.1: every time value is a pair of integers — value (ticks) + rate
 * (ticks per second). No floats are ever stored or computed inside the
 * engine; division exists only at UI display time (outside this package).
 *
 * A1.2: a timeline has ONE project rate. Cross-rate conversion happens
 * exactly once, at the import door, through convertRate() below. Inside
 * the engine every RationalTime carries the project rate.
 */

export type RationalTime = {
  /** integer tick count */
  value: number;
  /** integer ticks per second (fps) */
  rate: number;
};

/** Convenience constructor (keeps call sites terse and typo-proof). */
export function rationalTime(value: number, rate: number): RationalTime {
  return { value, rate };
}

/**
 * A1.3: convertRate — the ONE conversion helper, used only at the import
 * door. Rounds to the NEAREST frame in the new rate; an exact x.5 tie goes
 * DOWN (floor) — deterministic tie rule. Max error 0.5 frame.
 *
 * Implemented in pure integer arithmetic (no float rounding surprises):
 * exact result = value * newRate / rate; q = floor, rem = remainder.
 * 2*rem > den → round up; 2*rem < den → keep floor; 2*rem === den (exact
 * tie) → keep floor. Floor-based math also gives "ties to the lower
 * frame" for negative values, keeping the rule uniform.
 */
export function convertRate(t: RationalTime, newRate: number): RationalTime {
  if (newRate === t.rate) return { value: t.value, rate: newRate };
  const num = t.value * newRate;
  const den = t.rate;
  const q = Math.floor(num / den);
  const rem = num - q * den; // 0 <= rem < den
  const value = 2 * rem > den ? q + 1 : q;
  return { value, rate: newRate };
}
