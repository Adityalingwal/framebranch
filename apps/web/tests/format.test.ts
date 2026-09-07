/**
 * C5 #77 — `formatClock`, the one time format the product shows.
 *
 * Every fixture is built from LOCAL date parts (`new Date(y, m, d, …)`), so
 * these assertions hold in any timezone the suite is run in.
 */

import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatRulerLabel,
  quoted,
  rulerLabelStep,
} from "../src/lib/format";

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

describe("formatRulerLabel (C5 C-3 — the ruler is 4-part too)", () => {
  it("a whole second at 24 fps → HH:MM:SS:FF with the frames part 00", () => {
    expect(formatRulerLabel(0, 24)).toBe("00:00:00:00");
    expect(formatRulerLabel(5, 24)).toBe("00:00:05:00");
    expect(formatRulerLabel(65, 24)).toBe("00:01:05:00");
    expect(formatRulerLabel(3600, 24)).toBe("01:00:00:00");
  });

  it("never renders the old 2-part MM:SS shape", () => {
    for (let s = 0; s <= 120; s += 1) {
      expect(formatRulerLabel(s, 24)).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    }
  });
});

describe("rulerLabelStep (density — a 4-part label must not overlap)", () => {
  it("the editor's minimum zoom labels every 2 seconds, the default every 1", () => {
    expect(rulerLabelStep(44)).toBe(2); // MIN_PX_PER_SECOND
    expect(rulerLabelStep(76)).toBe(1); // DEFAULT_PX_PER_SECOND
    expect(rulerLabelStep(148)).toBe(1); // MAX_PX_PER_SECOND
  });

  it("a label plus its slack always fits inside `step` seconds of pixels", () => {
    for (const pxPerSecond of [8, 12, 20, 31, 32, 44, 63, 64, 100, 148]) {
      const step = rulerLabelStep(pxPerSecond);
      expect(pxPerSecond * step).toBeGreaterThanOrEqual(
        pxPerSecond >= 32 ? 64 : 0,
      );
      expect([1, 2, 5]).toContain(step);
    }
  });

  it("very low zoom falls back to every 5 seconds", () => {
    expect(rulerLabelStep(20)).toBe(5);
    expect(rulerLabelStep(31)).toBe(5);
    expect(rulerLabelStep(32)).toBe(2);
  });
});

describe("quoted (card names inside sentences)", () => {
  it("wraps a plain name in double quotes", () => {
    expect(quoted("Client pick")).toBe('"Client pick"');
  });
  it("leaves a name that already carries quotes alone (no nesting)", () => {
    expect(quoted('Restored "Travel vlog"')).toBe('Restored "Travel vlog"');
    expect(quoted('Brought "priya-music" into main')).toBe(
      'Brought "priya-music" into main',
    );
  });
});
