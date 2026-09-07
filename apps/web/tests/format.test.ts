/**
 * C5 #77 — `formatClock`, the one time format the product shows.
 *
 * Every fixture is built from LOCAL date parts (`new Date(y, m, d, …)`), so
 * these assertions hold in any timezone the suite is run in.
 */

import { describe, expect, it } from "vitest";

import { formatClock } from "../src/lib/format";

const at = (
  y: number,
  m: number,
  d: number,
  h: number,
  min = 0,
): string => new Date(y, m - 1, d, h, min).toISOString();

describe("formatClock", () => {
  it("same calendar day → clock only, no leading zero on the hour", () => {
    const now = new Date(2026, 8, 7, 18, 30);
    expect(formatClock(at(2026, 9, 7, 17, 11), now)).toBe("5:11 pm");
    expect(formatClock(at(2026, 9, 7, 9, 5), now)).toBe("9:05 am");
  });

  it("noon is 12:00 pm and midnight is 12:05 am", () => {
    const now = new Date(2026, 8, 7, 18, 30);
    expect(formatClock(at(2026, 9, 7, 12, 0), now)).toBe("12:00 pm");
    expect(formatClock(at(2026, 9, 7, 0, 5), now)).toBe("12:05 am");
  });

  it("one minute either side of midnight is a different DAY, not an hour", () => {
    // 23:59 on the 6th, read at 00:01 on the 7th (§6 edge case).
    const justAfterMidnight = new Date(2026, 8, 7, 0, 1);
    expect(formatClock(at(2026, 9, 6, 23, 59), justAfterMidnight)).toBe(
      "Sun 11:59 pm",
    );
    expect(formatClock(at(2026, 9, 7, 0, 0), justAfterMidnight)).toBe(
      "12:00 am",
    );
  });

  it("1 to 6 calendar days back → weekday form; 7 → date form", () => {
    const now = new Date(2026, 8, 13, 10, 0); // Sun 13 Sep 2026
    expect(formatClock(at(2026, 9, 12, 17, 11), now)).toBe("Sat 5:11 pm");
    expect(formatClock(at(2026, 9, 7, 17, 11), now)).toBe("Mon 5:11 pm"); // 6 days
    expect(formatClock(at(2026, 9, 6, 17, 11), now)).toBe("6 Sep, 5:11 pm");
  });

  it("older dates lose the weekday and keep no year", () => {
    const now = new Date(2026, 8, 30, 10, 0);
    expect(formatClock(at(2026, 9, 4, 17, 11), now)).toBe("4 Sep, 5:11 pm");
    expect(formatClock(at(2026, 1, 1, 0, 0), now)).toBe("1 Jan, 12:00 am");
  });

  it("crosses a year boundary without claiming the card is recent", () => {
    const now = new Date(2027, 0, 2, 9, 0); // 2 Jan 2027
    // 31 Dec is 2 days back → still the weekday form.
    expect(formatClock(at(2026, 12, 31, 22, 45), now)).toBe("Thu 10:45 pm");
    // 20 Dec is far enough back to become a date.
    expect(formatClock(at(2026, 12, 20, 22, 45), now)).toBe("20 Dec, 10:45 pm");
  });

  it("a timestamp in the future falls back to the date form", () => {
    const now = new Date(2026, 8, 7, 10, 0);
    expect(formatClock(at(2026, 9, 9, 10, 0), now)).toBe("9 Sep, 10:00 am");
  });
});
