import {
  EQUIPMENT_TYPES,
  OCCURRENCE_KIND_KEYS,
  type EquipmentStatus,
  type EquipmentType,
  type OccurrenceKind,
} from "../../shared/catalog.ts";
import { DAY, HOUR, localDate, startOfHour } from "../../shared/time.ts";
import type {
  Anomaly,
  BacktestResult,
  CityDataset,
  FailureRiskReport,
  RiskForecast,
  StaffingPlan,
  TrendReport,
} from "../../shared/types.ts";
import type { Database } from "../db.ts";
import { listAgents } from "../repositories/agents.ts";
import { listEquipment } from "../repositories/equipment.ts";
import {
  detectFlowAnomalies,
  detectOccurrenceSpikes,
  type FlowInput,
  type FlowWindow,
} from "./anomalies.ts";
import { assessFailureRisk, type MaintenanceRecord, type StatusEventRecord } from "./failures.ts";
import {
  backtestRiskModel,
  forecastRisk,
  trainRiskModel,
  type OccurrenceRecord,
  type RiskModel,
} from "./risk.ts";
import { planStaffing } from "./staffing.ts";
import { buildTrends, type UsageRecord } from "./trends.ts";

const WEEK = 7 * DAY;
const HISTORY_DAYS = 120;
const BASELINE_WEEKS = 4;
const USAGE_DAYS = 28;

type CacheEntry = { at: number; value: unknown };

export type PredictionService = ReturnType<typeof createPredictionService>;

export function createPredictionService(db: Database, city: CityDataset, liveMultiplier: number) {
  const cache = new Map<string, CacheEntry>();
  const neighborhoodIds = city.neighborhoods.map((item) => item.id);

  function cached<T>(key: string, ttlMs: number, now: number, compute: () => T): T {
    const entry = cache.get(key);
    if (entry && now - entry.at < ttlMs && now >= entry.at) {
      return entry.value as T;
    }
    const value = compute();
    cache.set(key, { at: now, value });
    return value;
  }

  function occurrenceRecords(since: number): OccurrenceRecord[] {
    const rows = db
      .prepare(
        "SELECT neighborhood_id, kind, created_at, source FROM occurrences WHERE created_at >= ?",
      )
      .all(since) as {
      neighborhood_id: string;
      kind: string;
      created_at: number;
      source: string;
    }[];
    return rows.map((row) => ({
      neighborhoodId: row.neighborhood_id,
      kind: row.kind as OccurrenceKind,
      createdAt: row.created_at,
      weight: row.source === "live" ? 1 / liveMultiplier : 1,
    }));
  }

  function statusEvents(): StatusEventRecord[] {
    const rows = db
      .prepare("SELECT equipment_id, status, at FROM equipment_status_events")
      .all() as { equipment_id: number; status: string; at: number }[];
    return rows.map((row) => ({
      equipmentId: row.equipment_id,
      status: row.status as EquipmentStatus,
      at: row.at,
    }));
  }

  function maintenanceEvents(): MaintenanceRecord[] {
    const rows = db.prepare("SELECT equipment_id, at FROM maintenance_events").all() as {
      equipment_id: number;
      at: number;
    }[];
    return rows.map((row) => ({ equipmentId: row.equipment_id, at: row.at }));
  }

  function model(now: number): RiskModel {
    return cached("model", 60_000, now, () =>
      trainRiskModel(occurrenceRecords(now - HISTORY_DAYS * DAY), neighborhoodIds, now),
    );
  }

  function risk(now: number, horizonHours: number): RiskForecast {
    return cached(`risk-${horizonHours}`, 60_000, now, () =>
      forecastRisk(model(now), city.neighborhoods, listEquipment(db), now, horizonHours),
    );
  }

  function staffing(now: number, horizonHours: number): StaffingPlan {
    return cached(`staffing-${horizonHours}`, 30_000, now, () =>
      planStaffing(model(now), city, listAgents(db), now, horizonHours),
    );
  }

  function flowInputs(now: number): FlowInput[] {
    const current = startOfHour(now);
    const last = current - HOUR;
    const hours = [current, last];
    for (let week = 1; week <= BASELINE_WEEKS; week += 1) {
      hours.push(current - week * WEEK, last - week * WEEK);
    }
    const rows = db
      .prepare(
        `SELECT equipment_id, hour_start, count FROM readings WHERE hour_start IN (${hours.map(() => "?").join(",")})`,
      )
      .all(...hours) as { equipment_id: number; hour_start: number; count: number }[];
    const counts = new Map(rows.map((row) => [`${row.equipment_id}|${row.hour_start}`, row.count]));
    const window = (id: number, hour: number, fraction: number): FlowWindow => ({
      observed: counts.get(`${id}|${hour}`) ?? 0,
      fraction,
      baseline: Array.from({ length: BASELINE_WEEKS }, (_, index) =>
        counts.get(`${id}|${hour - (index + 1) * WEEK}`),
      ).filter((value): value is number => value !== undefined),
    });
    return listEquipment(db)
      .filter((item) => {
        const telemetry = EQUIPMENT_TYPES[item.type].telemetry;
        return (telemetry === "flow" || telemetry === "usage") && item.status === "operational";
      })
      .map((item) => ({
        equipment: item,
        lastHour: window(item.id, last, 1),
        currentHour: window(item.id, current, (now - current) / HOUR),
      }));
  }

  function anomalies(now: number): Anomaly[] {
    return cached("anomalies", 15_000, now, () => {
      const riskModel = model(now);
      const rows = db
        .prepare(
          "SELECT neighborhood_id, COUNT(*) AS total FROM occurrences WHERE created_at >= ? AND source != 'history' GROUP BY neighborhood_id",
        )
        .all(now - HOUR) as { neighborhood_id: string; total: number }[];
      const observed = new Map(rows.map((row) => [row.neighborhood_id, row.total]));
      const spikes = detectOccurrenceSpikes(
        city.neighborhoods.map((neighborhood) => ({
          neighborhoodId: neighborhood.id,
          name: neighborhood.name,
          observed: observed.get(neighborhood.id) ?? 0,
          expected:
            OCCURRENCE_KIND_KEYS.reduce(
              (sum, kind) => sum + riskModel.expected(neighborhood.id, kind, now),
              0,
            ) * liveMultiplier,
        })),
        now,
      );
      return [...spikes, ...detectFlowAnomalies(flowInputs(now), now)].sort(
        (a, b) => b.score - a.score,
      );
    });
  }

  function failures(now: number): FailureRiskReport {
    return cached("failures", 120_000, now, () =>
      assessFailureRisk(listEquipment(db), statusEvents(), maintenanceEvents(), now, HISTORY_DAYS),
    );
  }

  function usageRecords(now: number): UsageRecord[] {
    const offset = 3 * HOUR;
    const since = now - (USAGE_DAYS + 1) * DAY;
    const rows = db
      .prepare(
        `WITH coverage AS (
           SELECT (hour_start - ${offset}) / ${DAY} AS day, COUNT(DISTINCT hour_start) AS hours
           FROM readings WHERE hour_start >= ? GROUP BY day
         )
         SELECT e.type AS type, (r.hour_start - ${offset}) / ${DAY} AS day, SUM(r.count) AS total,
           coverage.hours AS hours
         FROM readings r
         JOIN equipment e ON e.id = r.equipment_id
         JOIN coverage ON coverage.day = (r.hour_start - ${offset}) / ${DAY}
         WHERE r.hour_start >= ? GROUP BY e.type, day`,
      )
      .all(since, since) as { type: string; day: number; total: number; hours: number }[];
    return rows.map((row) => ({
      type: row.type as EquipmentType,
      day: localDate(row.day * DAY + offset + 12 * HOUR),
      total: row.total,
      hoursRecorded: row.hours,
    }));
  }

  function trends(now: number): TrendReport {
    return cached("trends", 120_000, now, () =>
      buildTrends({
        equipment: listEquipment(db),
        statusEvents: statusEvents(),
        occurrences: occurrenceRecords(now - 12 * WEEK),
        usage: usageRecords(now),
        neighborhoods: city.neighborhoods,
        regions: city.regions,
        now,
      }),
    );
  }

  function backtest(now: number): BacktestResult {
    return cached("backtest", 600_000, now, () =>
      backtestRiskModel(occurrenceRecords(now - HISTORY_DAYS * DAY), city.neighborhoods, now, 7),
    );
  }

  return {
    model,
    risk,
    staffing,
    anomalies,
    failures,
    trends,
    backtest,
    invalidate: () => cache.clear(),
  };
}
