import { describe, expect, it } from "vitest";
import type { Neighborhood } from "../../shared/types.ts";
import { DAY, HOUR, startOfLocalDay } from "../../shared/time.ts";
import { NOW, makeEquipment } from "../test-fixtures.ts";
import {
  backtestRiskModel,
  coverageMultiplier,
  forecastRisk,
  riskLevel,
  trainRiskModel,
  type OccurrenceRecord,
} from "./risk.ts";

const neighborhoods: Neighborhood[] = [
  { id: "busy", name: "Movimentado", regionId: "center", lat: 0, lng: 0, polygon: [] },
  { id: "quiet", name: "Tranquilo", regionId: "north", lat: 0, lng: 0, polygon: [] },
];
const ids = neighborhoods.map((item) => item.id);
const localHour = (dayStart: number, hour: number) => dayStart + hour * HOUR + 10 * 60_000;

function history(days: number, until: number): OccurrenceRecord[] {
  const records: OccurrenceRecord[] = [];
  for (let day = 1; day <= days; day += 1) {
    const dayStart = startOfLocalDay(until - day * DAY);
    for (let index = 0; index < 3; index += 1) {
      records.push({
        neighborhoodId: "busy",
        kind: "accident",
        createdAt: localHour(dayStart, 18) + index * 60_000,
        weight: 1,
      });
    }
    if (day % 7 === 0) {
      records.push({
        neighborhoodId: "quiet",
        kind: "vandalism",
        createdAt: localHour(dayStart, 3),
        weight: 1,
      });
    }
  }
  return records;
}

describe("trainRiskModel", () => {
  it("learns where and when occurrences concentrate", () => {
    const model = trainRiskModel(history(84, NOW), ids, NOW);
    const today = startOfLocalDay(NOW);
    expect(model.expected("busy", "accident", localHour(today, 18))).toBeGreaterThan(
      10 * model.expected("busy", "accident", localHour(today, 4)),
    );
    expect(model.share.get("busy")!.accident).toBeGreaterThan(model.share.get("quiet")!.accident);
  });

  it("raises the trend of a neighborhood whose recent volume grew", () => {
    const records = history(84, NOW);
    for (let day = 1; day <= 14; day += 1) {
      const dayStart = startOfLocalDay(NOW - day * DAY);
      for (let index = 0; index < 3; index += 1) {
        records.push({
          neighborhoodId: "quiet",
          kind: "public_safety",
          createdAt: localHour(dayStart, 22) + index * 60_000,
          weight: 1,
        });
      }
    }
    const model = trainRiskModel(records, ids, NOW);
    expect(model.trend.get("quiet")).toBeGreaterThan(1.3);
    expect(model.trend.get("busy")).toBeCloseTo(1, 1);
  });

  it("ignores records outside the training window and handles no data", () => {
    const future = [
      { neighborhoodId: "busy", kind: "accident" as const, createdAt: NOW + DAY, weight: 1 },
    ];
    const model = trainRiskModel(future, ids, NOW);
    expect(model.expected("busy", "accident", NOW)).toBe(0);
    expect(forecastRisk(model, neighborhoods, [], NOW, 6).neighborhoods).toHaveLength(2);
  });
});

describe("forecastRisk", () => {
  it("ranks the busy neighborhood first and reports its peak hour", () => {
    const model = trainRiskModel(history(84, NOW), ids, NOW);
    const start = localHour(startOfLocalDay(NOW), 16);
    const forecast = forecastRisk(model, neighborhoods, [], start, 4);
    expect(forecast.neighborhoods[0]!.neighborhoodId).toBe("busy");
    expect(forecast.neighborhoods[0]!.peakHour).toBe(18);
    expect(forecast.neighborhoods[0]!.score).toBeGreaterThan(forecast.neighborhoods[1]!.score);
    expect(forecast.weeklyPattern).toHaveLength(7);
    expect(forecast.weeklyPattern[0]).toHaveLength(24);
  });

  it("penalizes neighborhoods whose surveillance equipment is down", () => {
    const similar: Neighborhood[] = Array.from({ length: 12 }, (_, index) => ({
      id: `n${index}`,
      name: `Bairro ${index}`,
      regionId: "center",
      lat: 0,
      lng: 0,
      polygon: [],
    }));
    const records: OccurrenceRecord[] = [];
    for (let day = 1; day <= 84; day += 1) {
      const dayStart = startOfLocalDay(NOW - day * DAY);
      similar.forEach((neighborhood, index) => {
        if (day % (index + 2) === 0) {
          records.push({
            neighborhoodId: neighborhood.id,
            kind: "accident",
            createdAt: localHour(dayStart, 18),
            weight: 1,
          });
        }
      });
    }
    const model = trainRiskModel(
      records,
      similar.map((item) => item.id),
      NOW,
    );
    const start = localHour(startOfLocalDay(NOW), 16);
    const down = [1, 2, 3].map((id) =>
      makeEquipment({ id, neighborhoodId: "n6", status: "malfunction" }),
    );
    const healthy = forecastRisk(model, similar, [], start, 6).neighborhoods.find(
      (item) => item.neighborhoodId === "n6",
    )!;
    const degraded = forecastRisk(model, similar, down, start, 6).neighborhoods.find(
      (item) => item.neighborhoodId === "n6",
    )!;
    expect(degraded.coveragePenalty).toBeCloseTo(0.36, 5);
    expect(degraded.score).toBeGreaterThan(healthy.score);
  });
});

describe("coverageMultiplier", () => {
  it("counts only unavailable surveillance and enforcement equipment", () => {
    expect(
      coverageMultiplier([
        makeEquipment({ status: "not_installed" }),
        makeEquipment({ type: "e_scooter", status: "stolen" }),
      ]),
    ).toBe(1);
    expect(
      coverageMultiplier(
        Array.from({ length: 10 }, (_, id) => makeEquipment({ id, status: "stolen" })),
      ),
    ).toBe(1.5);
  });
});

describe("riskLevel", () => {
  it("maps score bands to levels", () => {
    expect([riskLevel(10), riskLevel(50), riskLevel(80), riskLevel(95)]).toEqual([
      "low",
      "moderate",
      "high",
      "critical",
    ]);
  });
});

describe("backtestRiskModel", () => {
  it("beats the flat average when occurrences follow an hourly pattern", () => {
    const result = backtestRiskModel(history(120, NOW), neighborhoods, NOW, 7);
    expect(result.evaluatedCells).toBe(2 * 42);
    expect(result.improvementPct).toBeGreaterThan(30);
    expect(result.topHitRate).toBeGreaterThan(result.baselineTopHitRate);
  });

  it("returns zeros when there is nothing to evaluate", () => {
    const result = backtestRiskModel([], neighborhoods, NOW, 7);
    expect(result.modelMae).toBe(0);
    expect(result.topHitRate).toBe(0);
  });
});
