import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  hourOfWeek,
  localDate,
  localParts,
  startOfLocalDay,
} from "./time.ts";

describe("local time in Marília (UTC-3)", () => {
  it("converts UTC to the local hour and weekday", () => {
    const ms = Date.parse("2026-10-18T02:30:00.000Z");
    expect(localParts(ms)).toEqual({ dow: 6, hour: 23, minute: 30 });
    expect(localDate(ms)).toBe("2026-10-17");
    expect(hourOfWeek(ms)).toBe(6 * 24 + 23);
  });

  it("finds the start of the local day", () => {
    const ms = Date.parse("2026-10-18T02:30:00.000Z");
    expect(new Date(startOfLocalDay(ms)).toISOString()).toBe("2026-10-17T03:00:00.000Z");
  });

  it("counts days between dates in both directions", () => {
    expect(daysBetween("2026-10-17", "2026-10-20")).toBe(3);
    expect(daysBetween("2026-10-20", "2026-10-17")).toBe(-3);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});
