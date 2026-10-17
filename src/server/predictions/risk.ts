import {
  OCCURRENCE_KINDS,
  OCCURRENCE_KIND_KEYS,
  countsTowardAvailability,
  type OccurrenceKind,
} from "../../shared/catalog.ts";
import { DAY, HOUR, hourOfWeek, localParts, startOfHour } from "../../shared/time.ts";
import type {
  BacktestResult,
  Equipment,
  Neighborhood,
  NeighborhoodRisk,
  RiskForecast,
  RiskLevel,
} from "../../shared/types.ts";
import { clamp, percentileRank } from "./stats.ts";

export type OccurrenceRecord = {
  neighborhoodId: string;
  kind: OccurrenceKind;
  createdAt: number;
  weight: number;
};

const HOURS_PER_WEEK = 168;
const WEEK = 7 * DAY;
const WEEK_DECAY = 0.85;
const TREND_RECENT_DAYS = 14;
const COVERAGE_STEP = 0.12;
const COVERAGE_MAX = 0.5;
const COVERAGE_TYPES = new Set(["radar", "camera", "smart_traffic_light"]);

export type RiskModelOptions = {
  weeks: number;
  shareWeeks: number;
  trendPseudoCount: number;
  trendMin: number;
  trendMax: number;
};

export const DEFAULT_RISK_OPTIONS: RiskModelOptions = {
  weeks: 12,
  shareWeeks: 16,
  trendPseudoCount: 8,
  trendMin: 0.7,
  trendMax: 1.6,
};

export type RiskModel = {
  trainedUntil: number;
  weeks: number;
  share: Map<string, Record<OccurrenceKind, number>>;
  profile: Record<OccurrenceKind, number[]>;
  trend: Map<string, number>;
  expected: (neighborhoodId: string, kind: OccurrenceKind, ms: number) => number;
};

function emptyProfile(): Record<OccurrenceKind, number[]> {
  return Object.fromEntries(
    OCCURRENCE_KIND_KEYS.map((kind) => [kind, Array.from({ length: HOURS_PER_WEEK }, () => 0)]),
  ) as Record<OccurrenceKind, number[]>;
}

function smoothCircular(values: number[]): number[] {
  const n = values.length;
  return values.map(
    (value, index) =>
      0.25 * values[(index - 1 + n) % n]! + 0.5 * value + 0.25 * values[(index + 1) % n]!,
  );
}

export function trainRiskModel(
  records: readonly OccurrenceRecord[],
  neighborhoodIds: readonly string[],
  until: number,
  options: RiskModelOptions = DEFAULT_RISK_OPTIONS,
): RiskModel {
  const { weeks, shareWeeks, trendPseudoCount, trendMin, trendMax } = options;
  const from = until - weeks * WEEK;
  const shareFrom = until - shareWeeks * WEEK;
  const raw = emptyProfile();
  const counts = new Map<string, Record<OccurrenceKind, number>>();
  const kindTotals = Object.fromEntries(OCCURRENCE_KIND_KEYS.map((kind) => [kind, 0])) as Record<
    OccurrenceKind,
    number
  >;
  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  const recentStart = until - TREND_RECENT_DAYS * DAY;

  for (const id of neighborhoodIds) {
    counts.set(id, { ...kindTotals });
  }

  let weightSum = 0;
  for (let week = 0; week < weeks; week += 1) {
    weightSum += WEEK_DECAY ** week;
  }

  for (const record of records) {
    if (record.createdAt >= until) {
      continue;
    }
    const entry = counts.get(record.neighborhoodId);
    if (entry && record.createdAt >= shareFrom) {
      entry[record.kind] += record.weight;
      kindTotals[record.kind] += record.weight;
    }
    if (record.createdAt < from) {
      continue;
    }
    const week = Math.floor((until - record.createdAt) / WEEK);
    raw[record.kind][hourOfWeek(record.createdAt)]! += WEEK_DECAY ** week * record.weight;
    const bucket = record.createdAt >= recentStart ? recent : prior;
    bucket.set(record.neighborhoodId, (bucket.get(record.neighborhoodId) ?? 0) + record.weight);
  }

  const profile = Object.fromEntries(
    OCCURRENCE_KIND_KEYS.map((kind) => [
      kind,
      smoothCircular(raw[kind].map((value) => value / weightSum)),
    ]),
  ) as Record<OccurrenceKind, number[]>;

  const share = new Map<string, Record<OccurrenceKind, number>>();
  const prior05 = 0.5;
  for (const [id, entry] of counts) {
    share.set(
      id,
      Object.fromEntries(
        OCCURRENCE_KIND_KEYS.map((kind) => [
          kind,
          (entry[kind] + prior05) / (kindTotals[kind] + prior05 * neighborhoodIds.length),
        ]),
      ) as Record<OccurrenceKind, number>,
    );
  }

  const priorDays = weeks * 7 - TREND_RECENT_DAYS;
  const trend = new Map<string, number>();
  for (const id of neighborhoodIds) {
    const expectedRecent = ((prior.get(id) ?? 0) * TREND_RECENT_DAYS) / priorDays;
    trend.set(
      id,
      clamp(
        ((recent.get(id) ?? 0) + trendPseudoCount) / (expectedRecent + trendPseudoCount),
        trendMin,
        trendMax,
      ),
    );
  }

  return {
    trainedUntil: until,
    weeks,
    share,
    profile,
    trend,
    expected: (neighborhoodId, kind, ms) =>
      (share.get(neighborhoodId)?.[kind] ?? 0) *
      profile[kind][hourOfWeek(ms)]! *
      (trend.get(neighborhoodId) ?? 1),
  };
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 95) {
    return "critical";
  }
  if (score >= 80) {
    return "high";
  }
  if (score >= 50) {
    return "moderate";
  }
  return "low";
}

export function coverageMultiplier(equipment: readonly Equipment[]): number {
  const unavailable = equipment.filter(
    (item) =>
      COVERAGE_TYPES.has(item.type) &&
      countsTowardAvailability(item.status) &&
      item.status !== "operational",
  ).length;
  return 1 + Math.min(COVERAGE_MAX, unavailable * COVERAGE_STEP);
}

function weightedAt(model: RiskModel, neighborhoodId: string, how: number): number {
  const share = model.share.get(neighborhoodId);
  if (!share) {
    return 0;
  }
  let total = 0;
  for (const kind of OCCURRENCE_KIND_KEYS) {
    total += share[kind] * model.profile[kind][how]! * OCCURRENCE_KINDS[kind].severityWeight;
  }
  return total * (model.trend.get(neighborhoodId) ?? 1);
}

export function forecastRisk(
  model: RiskModel,
  neighborhoods: readonly Neighborhood[],
  equipment: readonly Equipment[],
  now: number,
  horizonHours: number,
): RiskForecast {
  const start = startOfHour(now);
  const startHow = hourOfWeek(start);

  const reference: number[] = [];
  for (const neighborhood of neighborhoods) {
    const perHour = Array.from({ length: HOURS_PER_WEEK }, (_, how) =>
      weightedAt(model, neighborhood.id, how),
    );
    for (let begin = 0; begin < HOURS_PER_WEEK; begin += 1) {
      let sum = 0;
      for (let offset = 0; offset < horizonHours; offset += 1) {
        sum += perHour[(begin + offset) % HOURS_PER_WEEK]!;
      }
      reference.push(sum);
    }
  }
  reference.sort((a, b) => a - b);

  const cityHourly = Array.from({ length: horizonHours }, () => 0);
  const results: NeighborhoodRisk[] = neighborhoods.map((neighborhood) => {
    const hourly: number[] = [];
    const byKind = new Map<OccurrenceKind, number>();
    let weighted = 0;
    for (let offset = 0; offset < horizonHours; offset += 1) {
      const ms = start + offset * HOUR;
      let total = 0;
      for (const kind of OCCURRENCE_KIND_KEYS) {
        const value = model.expected(neighborhood.id, kind, ms);
        total += value;
        byKind.set(kind, (byKind.get(kind) ?? 0) + value);
      }
      hourly.push(total);
      cityHourly[offset]! += total;
      weighted += weightedAt(model, neighborhood.id, (startHow + offset) % HOURS_PER_WEEK);
    }
    const coverage = coverageMultiplier(
      equipment.filter((item) => item.neighborhoodId === neighborhood.id),
    );
    const score = percentileRank(reference, weighted * coverage);
    const peakOffset = hourly.indexOf(Math.max(...hourly));
    return {
      neighborhoodId: neighborhood.id,
      name: neighborhood.name,
      regionId: neighborhood.regionId,
      score,
      level: riskLevel(score),
      expected: hourly.reduce((sum, value) => sum + value, 0),
      peakHour: localParts(start + peakOffset * HOUR).hour,
      hourly,
      topKinds: [...byKind.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([kind, expected]) => ({ kind, expected })),
      coveragePenalty: coverage - 1,
      trendPct: ((model.trend.get(neighborhood.id) ?? 1) - 1) * 100,
    };
  });

  const weeklyPattern = Array.from({ length: 7 }, (_day, dow) =>
    Array.from({ length: 24 }, (_hour, hour) =>
      OCCURRENCE_KIND_KEYS.reduce((sum, kind) => sum + model.profile[kind][dow * 24 + hour]!, 0),
    ),
  );

  return {
    generatedAt: new Date(now).toISOString(),
    horizonHours,
    startHour: localParts(start).hour,
    neighborhoods: results.sort((a, b) => b.score - a.score || b.expected - a.expected),
    cityHourly,
    weeklyPattern,
  };
}

const BLOCK_HOURS = 4;
const TOP_SHARE = 0.1;

function captureRate(cells: { predicted: number; actual: number }[], totalActual: number): number {
  const top = [...cells]
    .sort((a, b) => b.predicted - a.predicted)
    .slice(0, Math.ceil(cells.length * TOP_SHARE));
  return totalActual === 0
    ? 0
    : (top.reduce((sum, cell) => sum + cell.actual, 0) / totalActual) * 100;
}

export function backtestRiskModel(
  records: readonly OccurrenceRecord[],
  neighborhoods: readonly Pick<Neighborhood, "id" | "regionId">[],
  now: number,
  days = 7,
  options: RiskModelOptions = DEFAULT_RISK_OPTIONS,
): BacktestResult {
  const { weeks } = options;
  const cutoff = startOfHour(now - days * DAY);
  const regionOf = new Map(neighborhoods.map((item) => [item.id, item.regionId]));
  const regionIds = [...new Set(regionOf.values())];
  const model = trainRiskModel(
    records,
    neighborhoods.map((item) => item.id),
    cutoff,
    options,
  );
  const trainingFrom = cutoff - weeks * WEEK;
  const blocks = Math.floor((days * 24) / BLOCK_HOURS);

  const actual = new Map<string, number>();
  const trainingTotals = new Map<string, number>();
  for (const record of records) {
    const region = regionOf.get(record.neighborhoodId);
    if (region === undefined) {
      continue;
    }
    if (record.createdAt >= cutoff && record.createdAt < cutoff + blocks * BLOCK_HOURS * HOUR) {
      const block = Math.floor((record.createdAt - cutoff) / (BLOCK_HOURS * HOUR));
      const key = `${region}|${block}`;
      actual.set(key, (actual.get(key) ?? 0) + record.weight);
    } else if (record.createdAt >= trainingFrom && record.createdAt < cutoff) {
      trainingTotals.set(region, (trainingTotals.get(region) ?? 0) + record.weight);
    }
  }

  const modelCells: { predicted: number; actual: number }[] = [];
  const baselineCells: { predicted: number; actual: number }[] = [];
  let modelError = 0;
  let baselineError = 0;
  let totalActual = 0;

  for (const regionId of regionIds) {
    const members = neighborhoods.filter((item) => item.regionId === regionId);
    const flatRate = ((trainingTotals.get(regionId) ?? 0) / (weeks * HOURS_PER_WEEK)) * BLOCK_HOURS;
    for (let block = 0; block < blocks; block += 1) {
      let predicted = 0;
      for (let hour = 0; hour < BLOCK_HOURS; hour += 1) {
        const ms = cutoff + (block * BLOCK_HOURS + hour) * HOUR;
        for (const member of members) {
          for (const kind of OCCURRENCE_KIND_KEYS) {
            predicted += model.expected(member.id, kind, ms);
          }
        }
      }
      const observed = actual.get(`${regionId}|${block}`) ?? 0;
      modelError += Math.abs(predicted - observed);
      baselineError += Math.abs(flatRate - observed);
      totalActual += observed;
      modelCells.push({ predicted, actual: observed });
      baselineCells.push({ predicted: flatRate, actual: observed });
    }
  }

  const cells = modelCells.length;
  const modelMae = cells === 0 ? 0 : modelError / cells;
  const baselineMae = cells === 0 ? 0 : baselineError / cells;
  return {
    generatedAt: new Date(now).toISOString(),
    days,
    modelMae,
    baselineMae,
    improvementPct: baselineMae === 0 ? 0 : ((baselineMae - modelMae) / baselineMae) * 100,
    topHitRate: captureRate(modelCells, totalActual),
    baselineTopHitRate: captureRate(baselineCells, totalActual),
    evaluatedCells: cells,
  };
}
