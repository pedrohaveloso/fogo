import { describe, expect, it } from "vitest";
import type { Neighborhood, Region } from "../../shared/types.ts";
import { DAY, HOUR, localDate } from "../../shared/time.ts";
import { NOW, makeEquipment } from "../test-fixtures.ts";
import type { StatusEventRecord } from "./failures.ts";
import type { OccurrenceRecord } from "./risk.ts";
import { buildTrends, gapDays } from "./trends.ts";

const regions: Region[] = [{ id: "center", name: "Centro", polygon: [] }];
const neighborhoods: Neighborhood[] = [
  { id: "a", name: "Jardim A", regionId: "center", lat: 0, lng: 0, polygon: [] },
  { id: "b", name: "Jardim B", regionId: "center", lat: 0, lng: 0, polygon: [] },
];

function steadyOccurrences(): OccurrenceRecord[] {
  const records: OccurrenceRecord[] = [];
  for (let day = 1; day <= 84; day += 1) {
    if (day % 4 === 0) {
      records.push({
        neighborhoodId: "b",
        kind: "accident",
        createdAt: NOW - day * DAY,
        weight: 1,
      });
    }
    if (day % 4 === 0 || (day <= 28 && day % 4 === 2)) {
      for (let index = 0; index < (day <= 28 ? 3 : 1); index += 1) {
        records.push({
          neighborhoodId: "a",
          kind: "accident",
          createdAt: NOW - day * DAY + index * HOUR,
          weight: 1,
        });
      }
    }
  }
  return records;
}

describe("buildTrends", () => {
  it("reports a significant rise only for the neighborhood that grew", () => {
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences: steadyOccurrences(),
      usage: [],
      usageGaps: new Set(),
      occurrenceGaps: new Set(),
      neighborhoods,
      regions,
      now: NOW,
    });
    const rising = report.insights.filter((text) => text.startsWith("Ocorrências em"));
    expect(rising).toHaveLength(1);
    expect(rising[0]).toContain("Jardim A");
  });

  it("detects a fleet whose availability keeps falling", () => {
    const equipment = Array.from({ length: 20 }, (_, index) =>
      makeEquipment({ id: index + 1, type: "e_scooter" }),
    );
    const statusEvents: StatusEventRecord[] = equipment.map((item) => ({
      equipmentId: item.id,
      status: "operational",
      at: NOW - 100 * DAY,
    }));
    equipment.slice(0, 8).forEach((item, index) => {
      statusEvents.push({
        equipmentId: item.id,
        status: "malfunction",
        at: NOW - (50 - index * 6) * DAY,
      });
    });
    const report = buildTrends({
      equipment,
      statusEvents,
      occurrences: [],
      usage: [],
      usageGaps: new Set(),
      occurrenceGaps: new Set(),
      neighborhoods,
      regions,
      now: NOW,
    });
    const scooters = report.availability.find((series) => series.key === "e_scooter")!;
    expect(scooters.slopePerWeek).toBeLessThan(-1);
    expect(scooters.projection).toHaveLength(30);
    expect(scooters.projection.every((point) => point.value >= 0 && point.value <= 100)).toBe(true);
    expect(
      scooters.projection.every((point) => point.low <= point.value && point.value <= point.high),
    ).toBe(true);
    const first = scooters.projection[0]!;
    const last = scooters.projection.at(-1)!;
    expect(last.high - last.low).toBeGreaterThanOrEqual(first.high - first.low);
    expect(report.insights.some((text) => text.includes("patinetes cai"))).toBe(true);
  });

  it("skips fleets too small to read a trend and drops partial usage days", () => {
    const equipment = [makeEquipment({ id: 1, type: "variable_message_sign" })];
    const today = localDate(NOW);
    const report = buildTrends({
      equipment,
      statusEvents: [{ equipmentId: 1, status: "operational", at: NOW - 100 * DAY }],
      occurrences: [],
      usage: [
        { type: "parking_kiosk", day: localDate(NOW - 40 * DAY), total: 1 },
        { type: "parking_kiosk", day: localDate(NOW - 3 * DAY), total: 100 },
        { type: "parking_kiosk", day: today, total: 5 },
      ],
      usageGaps: new Set([today]),
      occurrenceGaps: new Set(),
      neighborhoods,
      regions,
      now: NOW,
    });
    expect(
      report.availability.find((series) => series.key === "variable_message_sign"),
    ).toBeUndefined();
    expect(report.usage[0]!.days).toEqual([localDate(NOW - 3 * DAY)]);
  });

  it("ignores days the server was down so a gap does not read as a drop", () => {
    const gap = localDate(NOW - 3 * DAY);
    const usage = Array.from({ length: 28 }, (_, index) => {
      const day = localDate(NOW - (28 - index) * DAY);
      return { type: "camera" as const, day, total: day === gap ? 120 : 1000 };
    });
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences: [],
      usage,
      usageGaps: new Set([gap]),
      occurrenceGaps: new Set(),
      neighborhoods,
      regions,
      now: NOW,
    });
    const series = report.usage[0]!;
    expect(series.days).toHaveLength(27);
    expect(series.days).not.toContain(localDate(NOW - 3 * DAY));
    expect(series.slopePerWeek).toBeCloseTo(0, 6);
  });

  it("reads a real decline even with a missing day and skips weeks with too few days", () => {
    const usage = Array.from({ length: 28 }, (_, index) => ({
      type: "camera" as const,
      day: localDate(NOW - (28 - index) * DAY),
      total: 1000 + index * 10,
    }));
    const uncoveredDays = new Set(
      usage.filter((_, index) => index === 10 || index < 4).map((record) => record.day),
    );
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences: [],
      usage,
      usageGaps: uncoveredDays,
      occurrenceGaps: new Set(),
      neighborhoods,
      regions,
      now: NOW,
    });
    expect(report.usage[0]!.slopePerWeek).toBeCloseTo(70, 0);
  });

  it("leaves days without simulation out of the weekly occurrence series", () => {
    const occurrences: OccurrenceRecord[] = [];
    const uncoveredDays = new Set<string>();
    for (let daysAgo = 1; daysAgo <= 84; daysAgo += 1) {
      const day = localDate(NOW - daysAgo * DAY);
      if (daysAgo <= 6) {
        uncoveredDays.add(day);
        continue;
      }
      if (daysAgo === 12) {
        uncoveredDays.add(day);
        continue;
      }
      for (let index = 0; index < 4; index += 1) {
        occurrences.push({
          neighborhoodId: "a",
          kind: "accident",
          createdAt: NOW - daysAgo * DAY + index * HOUR,
          weight: 1,
        });
      }
    }
    uncoveredDays.add(localDate(NOW));
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences,
      usage: [],
      usageGaps: new Set(),
      occurrenceGaps: uncoveredDays,
      neighborhoods,
      regions,
      now: NOW,
    });
    const center = report.occurrences[0]!;
    expect(center.days).toHaveLength(11);
    expect(center.values.every((value) => Math.abs(value - 28) < 1e-9)).toBe(true);
    expect(center.slopePerWeek).toBeCloseTo(0, 6);
    expect(report.insights.some((text) => text.startsWith("Centro"))).toBe(false);
  });
});

function hoursOf(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => start + index * HOUR);
}

describe("gapDays", () => {
  const dayStart = Date.parse("2026-10-10T03:00:00.000Z");

  it("flags days with fewer than 20 recorded hours and always the current day", () => {
    const hours = new Set([
      ...hoursOf(dayStart, 24),
      ...hoursOf(dayStart + DAY, 19),
      ...hoursOf(dayStart + 2 * DAY, 20),
    ]);
    const gaps = gapDays(hours, dayStart, dayStart + 3 * DAY + 5 * HOUR, 0);
    expect([...gaps].sort()).toEqual(["2026-10-11", "2026-10-13"]);
  });

  it("counts every hour before the seed as recorded", () => {
    const gaps = gapDays(new Set(), dayStart, dayStart + 2 * DAY + HOUR, dayStart + DAY + 6 * HOUR);
    expect([...gaps].sort()).toEqual(["2026-10-11", "2026-10-12"]);
    expect(
      gapDays(
        new Set(hoursOf(dayStart + DAY + 6 * HOUR, 18)),
        dayStart,
        dayStart + 2 * DAY,
        dayStart + DAY + 6 * HOUR,
      ),
    ).toEqual(new Set(["2026-10-12"]));
  });
});
