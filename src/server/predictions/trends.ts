import {
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  countsTowardAvailability,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import { DAY, HOUR, addDays, daysBetween, localDate, startOfLocalDay } from "../../shared/time.ts";
import type {
  Equipment,
  Neighborhood,
  Region,
  TrendReport,
  TrendSeries,
} from "../../shared/types.ts";
import type { StatusEventRecord } from "./failures.ts";
import type { OccurrenceRecord } from "./risk.ts";
import { clamp, linearRegression, poissonTail, slopeTStatistic } from "./stats.ts";

const AVAILABILITY_DAYS = 90;
const REGRESSION_DAYS = 56;
const PROJECTION_DAYS = 30;
const OCCURRENCE_WEEKS = 12;
const PROJECTION_WEEKS = 4;
const USAGE_DAYS = 28;
const USAGE_MIN_HOURS = 20;
const USAGE_MIN_DAYS_PER_WEEK = 4;
const INSIGHT_MIN_FLEET = 10;
const INSIGHT_MIN_SLOPE = 0.5;
const INSIGHT_MIN_T = 3;
const RISE_RECENT_DAYS = 28;
const RISE_BASELINE_DAYS = 56;
const RISE_MIN_COUNT = 12;
const RISE_P_VALUE = 0.001;

export type UsageRecord = {
  type: EquipmentType;
  day: string;
  total: number;
  hoursRecorded: number;
};

export type TrendInput = {
  equipment: readonly Equipment[];
  statusEvents: readonly StatusEventRecord[];
  occurrences: readonly OccurrenceRecord[];
  usage: readonly UsageRecord[];
  neighborhoods: readonly Neighborhood[];
  regions: readonly Region[];
  now: number;
};

function formatNumber(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

function seriesWithProjection(
  key: string,
  label: string,
  days: string[],
  values: number[],
  stepDays: number,
  regressionPoints: number,
  projectionPoints: number,
  bounds: [number, number],
): TrendSeries {
  const tail = values.slice(-regressionPoints);
  const { slope, intercept } = linearRegression(tail);
  const lastDay = days.at(-1) ?? localDate(Date.now());
  const projection = Array.from({ length: projectionPoints }, (_, index) => ({
    day: addDays(lastDay, (index + 1) * stepDays),
    value: clamp(intercept + slope * (tail.length + index), bounds[0], bounds[1]),
  }));
  return { key, label, days, values, slopePerWeek: (slope * 7) / stepDays, projection };
}

function availabilitySeries(input: TrendInput): { series: TrendSeries; significant: boolean }[] {
  const { equipment, statusEvents, now } = input;
  const typeOf = new Map(equipment.map((item) => [item.id, item.type]));
  const byEquipment = new Map<number, StatusEventRecord[]>();
  for (const event of statusEvents) {
    const list = byEquipment.get(event.equipmentId) ?? [];
    list.push(event);
    byEquipment.set(event.equipmentId, list);
  }
  for (const list of byEquipment.values()) {
    list.sort((a, b) => a.at - b.at);
  }

  const firstDay = startOfLocalDay(now) - (AVAILABILITY_DAYS - 1) * DAY;
  const days: string[] = [];
  const operational = new Map<string, number[]>();
  const countable = new Map<string, number[]>();
  const keys = ["all", ...EQUIPMENT_TYPE_KEYS];
  for (const key of keys) {
    operational.set(key, []);
    countable.set(key, []);
  }

  const cursors = new Map<number, { index: number; status: EquipmentStatus | null }>();
  for (let dayIndex = 0; dayIndex < AVAILABILITY_DAYS; dayIndex += 1) {
    const noon = Math.min(firstDay + dayIndex * DAY + 12 * HOUR, now);
    days.push(localDate(noon));
    for (const key of keys) {
      operational.get(key)!.push(0);
      countable.get(key)!.push(0);
    }
    for (const [id, events] of byEquipment) {
      const cursor = cursors.get(id) ?? { index: 0, status: null };
      while (cursor.index < events.length && events[cursor.index]!.at <= noon) {
        cursor.status = events[cursor.index]!.status;
        cursor.index += 1;
      }
      cursors.set(id, cursor);
      const type = typeOf.get(id);
      if (!type || cursor.status === null || !countsTowardAvailability(cursor.status)) {
        continue;
      }
      for (const key of ["all", type]) {
        countable.get(key)![dayIndex]! += 1;
        if (cursor.status === "operational") {
          operational.get(key)![dayIndex]! += 1;
        }
      }
    }
  }

  return keys.flatMap((key) => {
    const totals = countable.get(key)!;
    if (Math.min(...totals) < 3) {
      return [];
    }
    const values = totals.map((total, index) => (operational.get(key)![index]! / total) * 100);
    const label =
      key === "all" ? "Todos os equipamentos" : EQUIPMENT_TYPES[key as EquipmentType].plural;
    const series = seriesWithProjection(
      key,
      label,
      days,
      values,
      1,
      REGRESSION_DAYS,
      PROJECTION_DAYS,
      [0, 100],
    );
    const significant =
      Math.min(...totals) >= INSIGHT_MIN_FLEET &&
      Math.abs(series.slopePerWeek) >= INSIGHT_MIN_SLOPE &&
      Math.abs(slopeTStatistic(values.slice(-REGRESSION_DAYS))) >= INSIGHT_MIN_T;
    return [{ series, significant }];
  });
}

function occurrenceSeries(input: TrendInput): TrendSeries[] {
  const { occurrences, neighborhoods, regions, now } = input;
  const regionOf = new Map(neighborhoods.map((item) => [item.id, item.regionId]));
  const start = now - OCCURRENCE_WEEKS * 7 * DAY;
  const weeks = Array.from({ length: OCCURRENCE_WEEKS }, (_, index) =>
    localDate(start + index * 7 * DAY),
  );
  const counts = new Map(
    regions.map((region) => [region.id, Array.from({ length: OCCURRENCE_WEEKS }, () => 0)]),
  );
  for (const record of occurrences) {
    if (record.createdAt < start || record.createdAt >= now) {
      continue;
    }
    const week = Math.floor((record.createdAt - start) / (7 * DAY));
    const series = counts.get(regionOf.get(record.neighborhoodId) ?? "");
    if (series && week < OCCURRENCE_WEEKS) {
      series[week]! += record.weight;
    }
  }
  return regions.map((region) =>
    seriesWithProjection(
      region.id,
      region.name,
      weeks,
      counts.get(region.id)!,
      7,
      OCCURRENCE_WEEKS,
      PROJECTION_WEEKS,
      [0, Number.POSITIVE_INFINITY],
    ),
  );
}

function weeklyTotals(days: string[], values: number[]): number[] {
  const lastDay = days.at(-1);
  if (lastDay === undefined) {
    return [];
  }
  const weeks = new Map<number, { sum: number; days: number }>();
  days.forEach((day, index) => {
    const week = Math.floor(daysBetween(day, lastDay) / 7);
    const bucket = weeks.get(week) ?? { sum: 0, days: 0 };
    bucket.sum += values[index]!;
    bucket.days += 1;
    weeks.set(week, bucket);
  });
  return [...weeks.entries()]
    .filter(([, bucket]) => bucket.days >= USAGE_MIN_DAYS_PER_WEEK)
    .sort(([a], [b]) => b - a)
    .map(([, bucket]) => (bucket.sum / bucket.days) * 7);
}

function usageSeries(input: TrendInput): TrendSeries[] {
  const byType = new Map<EquipmentType, Map<string, number>>();
  for (const record of input.usage) {
    if (record.hoursRecorded < USAGE_MIN_HOURS) {
      continue;
    }
    const days = byType.get(record.type) ?? new Map<string, number>();
    days.set(record.day, (days.get(record.day) ?? 0) + record.total);
    byType.set(record.type, days);
  }
  const today = localDate(input.now);
  const firstDay = localDate(input.now - USAGE_DAYS * DAY);
  return [...byType.entries()].map(([type, totals]) => {
    const ordered = [...totals.entries()]
      .filter(([day]) => day >= firstDay && day < today)
      .sort(([a], [b]) => a.localeCompare(b));
    const label =
      {
        parking_kiosk: "Transações nos totens",
        automated_gate: "Passagens nas cancelas",
      }[type as string] ?? `Fluxo medido por ${EQUIPMENT_TYPES[type].plural.toLowerCase()}`;
    const days = ordered.map(([day]) => day);
    const values = ordered.map(([, total]) => total);
    return {
      key: type,
      label,
      days,
      values,
      slopePerWeek: linearRegression(weeklyTotals(days, values)).slope / 7,
      projection: [],
    };
  });
}

function risingNeighborhoods(input: TrendInput): string[] {
  const { occurrences, neighborhoods, now } = input;
  const recentStart = now - RISE_RECENT_DAYS * DAY;
  const baselineStart = recentStart - RISE_BASELINE_DAYS * DAY;
  const recent = new Map<string, number>();
  const baseline = new Map<string, number>();
  for (const record of occurrences) {
    if (record.createdAt >= recentStart && record.createdAt < now) {
      recent.set(record.neighborhoodId, (recent.get(record.neighborhoodId) ?? 0) + record.weight);
    } else if (record.createdAt >= baselineStart && record.createdAt < recentStart) {
      baseline.set(
        record.neighborhoodId,
        (baseline.get(record.neighborhoodId) ?? 0) + record.weight,
      );
    }
  }
  return neighborhoods
    .map((item) => {
      const observed = Math.round(recent.get(item.id) ?? 0);
      const expected = ((baseline.get(item.id) ?? 0) * RISE_RECENT_DAYS) / RISE_BASELINE_DAYS;
      return {
        name: item.name,
        observed,
        expected,
        p: poissonTail(observed, Math.max(expected, 1)),
      };
    })
    .filter((item) => item.observed >= RISE_MIN_COUNT && item.p < RISE_P_VALUE)
    .sort((a, b) => a.p - b.p)
    .slice(0, 4)
    .map(
      (item) =>
        `Ocorrências em ${item.name} subiram ${Math.round((item.observed / Math.max(item.expected, 1) - 1) * 100)}% nas últimas 4 semanas: foram ${item.observed}, contra cerca de ${Math.round(item.expected)} esperadas pela média das 8 semanas anteriores. Vale reforçar o patrulhamento e investigar a causa.`,
    );
}

export function buildTrends(input: TrendInput): TrendReport {
  const availabilityResults = availabilitySeries(input);
  const availability = availabilityResults.map((item) => item.series);
  const occurrences = occurrenceSeries(input);
  const usage = usageSeries(input);
  const insights: string[] = [];

  for (const { series, significant } of availabilityResults) {
    if (!significant) {
      continue;
    }
    const projected = series.projection.at(-1)?.value ?? series.values.at(-1) ?? 0;
    if (series.slopePerWeek < 0) {
      insights.push(
        `A disponibilidade de ${series.label.toLowerCase()} cai ${formatNumber(-series.slopePerWeek)} ponto(s) percentual(is) por semana. Mantido o ritmo, chega a ${formatNumber(projected, 0)}% em ${PROJECTION_DAYS} dias.`,
      );
    } else {
      insights.push(
        `A disponibilidade de ${series.label.toLowerCase()} melhora ${formatNumber(series.slopePerWeek)} ponto(s) percentual(is) por semana.`,
      );
    }
  }

  insights.push(...risingNeighborhoods(input));

  for (const series of occurrences) {
    const average =
      series.values.reduce((sum, value) => sum + value, 0) / Math.max(series.values.length, 1);
    if (average > 0 && series.slopePerWeek / average >= 0.03) {
      insights.push(
        `${series.label}: as ocorrências crescem cerca de ${formatNumber((series.slopePerWeek / average) * 100, 0)}% por semana nas últimas ${OCCURRENCE_WEEKS} semanas.`,
      );
    }
  }

  return {
    generatedAt: new Date(input.now).toISOString(),
    availability,
    occurrences,
    usage,
    insights,
  };
}
