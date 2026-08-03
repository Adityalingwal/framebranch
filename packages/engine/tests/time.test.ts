import { describe, expect, it } from "vitest";
import { convertRate, rationalTime } from "../src/time";

describe("A1: rational time", () => {
  it("A1.1: RationalTime is a pair of integers (value + rate), stored as-is", () => {
    const t = rationalTime(36, 24);
    expect(t).toEqual({ value: 36, rate: 24 });
    expect(Number.isInteger(t.value)).toBe(true);
    expect(Number.isInteger(t.rate)).toBe(true);
  });

  // A1.3: round to nearest frame; an exact x.5 tie goes DOWN (floor).
  const rows: {
    name: string;
    value: number;
    rate: number;
    newRate: number;
    expected: number;
  }[] = [
    {
      name: "same rate passes through untouched",
      value: 17,
      rate: 24,
      newRate: 24,
      expected: 17,
    },
    {
      name: "exact conversion (0.5s: 15@30 → 12@24)",
      value: 15,
      rate: 30,
      newRate: 24,
      expected: 12,
    },
    {
      name: "rounds down when below half (7@30 → 5.6 → 6@24)",
      value: 7,
      rate: 30,
      newRate: 24,
      expected: 6,
    },
    {
      name: "rounds to nearest below (4@30 → 3.2 → 3@24)",
      value: 4,
      rate: 30,
      newRate: 24,
      expected: 3,
    },
    {
      name: "tie x.5 goes DOWN (5@48 → 2.5 → 2@24)",
      value: 5,
      rate: 48,
      newRate: 24,
      expected: 2,
    },
    {
      name: "tie x.5 goes DOWN (7@48 → 3.5 → 3@24)",
      value: 7,
      rate: 48,
      newRate: 24,
      expected: 3,
    },
    {
      name: "tie x.5 goes DOWN upscaling too (2@24 → 2.5 → 2@30)",
      value: 2,
      rate: 24,
      newRate: 30,
      expected: 2,
    },
    {
      name: "non-tie upscaling rounds nearest (3@24 → 3.75 → 4@30)",
      value: 3,
      rate: 24,
      newRate: 30,
      expected: 4,
    },
    {
      name: "60fps screen recording → 24 (91@60 → 36.4 → 36@24)",
      value: 91,
      rate: 60,
      newRate: 24,
      expected: 36,
    },
    { name: "zero stays zero", value: 0, rate: 30, newRate: 24, expected: 0 },
    {
      name: "negative tie also takes the LOWER frame (-5@48 → -2.5 → -3@24)",
      value: -5,
      rate: 48,
      newRate: 24,
      expected: -3,
    },
  ];

  it.each(rows)(
    "A1.3: convertRate — $name",
    ({ value, rate, newRate, expected }) => {
      expect(convertRate(rationalTime(value, rate), newRate)).toEqual({
        value: expected,
        rate: newRate,
      });
    },
  );

  it("A1.3: result is always an integer frame count", () => {
    for (let v = -50; v <= 50; v++) {
      const out = convertRate(rationalTime(v, 30), 24);
      expect(Number.isInteger(out.value)).toBe(true);
      // nearest guarantee: |exact - rounded| <= 0.5
      expect(Math.abs((v * 24) / 30 - out.value)).toBeLessThanOrEqual(0.5);
    }
  });
});
