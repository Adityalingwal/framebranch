
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

export function convertRate(t: RationalTime, newRate: number): RationalTime {
  if (newRate === t.rate) return { value: t.value, rate: newRate };
  const num = t.value * newRate;
  const den = t.rate;
  const q = Math.floor(num / den);
  const rem = num - q * den; // 0 <= rem < den
  const value = 2 * rem > den ? q + 1 : q;
  return { value, rate: newRate };
}
