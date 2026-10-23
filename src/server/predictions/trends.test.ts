import { describe, expect, it } from "vitest";
import type { Neighborhood, Region } from "../../shared/types.ts";
import { DAY, HOUR, localDate } from "../../shared/time.ts";
import { NOW, makeEquipment } from "../test-fixtures.ts";
import type { StatusEventRecord } from "./failures.ts";
import type { OccurrenceRecord } from "./risk.ts";
import { buildTrends } from "./trends.ts";

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
      neighborhoods,
      regions,
      now: NOW,
    });
    const scooters = report.availability.find((series) => series.key === "e_scooter")!;
    expect(scooters.slopePerWeek).toBeLessThan(-1);
    expect(scooters.projection).toHaveLength(30);
    expect(scooters.projection.every((point) => point.value >= 0 && point.value <= 100)).toBe(true);
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
        { type: "parking_kiosk", day: localDate(NOW - 40 * DAY), total: 1, hoursRecorded: 24 },
        { type: "parking_kiosk", day: localDate(NOW - 3 * DAY), total: 100, hoursRecorded: 24 },
        { type: "parking_kiosk", day: today, total: 5, hoursRecorded: 15 },
      ],
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
    const usage = Array.from({ length: 28 }, (_, index) => {
      const daysAgo = 28 - index;
      const gap = daysAgo === 3;
      return {
        type: "camera" as const,
        day: localDate(NOW - daysAgo * DAY),
        total: gap ? 120 : 1000,
        hoursRecorded: gap ? 4 : 24,
      };
    });
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences: [],
      usage,
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
      hoursRecorded: index === 10 || index < 4 ? 0 : 24,
    }));
    const report = buildTrends({
      equipment: [],
      statusEvents: [],
      occurrences: [],
      usage,
      neighborhoods,
      regions,
      now: NOW,
    });
    expect(report.usage[0]!.slopePerWeek).toBeCloseTo(70, 0);
  });
});
