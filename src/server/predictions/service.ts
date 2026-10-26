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
import { getSetting, type Queryable } from "../db.ts";
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
import { buildTrends, gapDays, type UsageRecord } from "./trends.ts";

const WEEK = 7 * DAY;
const HISTORY_DAYS = 120;
const BASELINE_WEEKS = 4;
const USAGE_DAYS = 28;

type CacheEntry = { at: number; value: Promise<unknown> };

type OccurrenceRow = { neighborhood_id: string; kind: string; created_at: number; source: string };

export type PredictionService = ReturnType<typeof createPredictionService>;

export function createPredictionService(db: Queryable, city: CityDataset, liveMultiplier: number) {
  const cache = new Map<string, CacheEntry>();
  const cityId = city.city.id;
  const equipment = () => listEquipment(db, cityId);

  function cached<T>(
    key: string,
    ttlMs: number,
    now: number,
    compute: () => Promise<T>,
  ): Promise<T> {
    const entry = cache.get(key);
    if (entry && now - entry.at < ttlMs && now >= entry.at) {
      return entry.value as Promise<T>;
    }
    const value = compute();
    cache.set(key, { at: now, value });
    value.catch(() => {
      if (cache.get(key)?.value === value) {
        cache.delete(key);
      }
    });
    return value;
  }

  async function occurrenceRecords(since: number): Promise<OccurrenceRecord[]> {
    const rows = await db.query<OccurrenceRow>(
      "SELECT neighborhood_id, kind, created_at, source FROM occurrences WHERE city_id = $1 AND created_at >= $2",
      [cityId, since],
    );
    return rows.map((row) => ({
      neighborhoodId: row.neighborhood_id,
      kind: row.kind as OccurrenceKind,
      createdAt: row.created_at,
      weight: row.source === "live" ? 1 / liveMultiplier : 1,
    }));
  }

  async function statusEvents(): Promise<StatusEventRecord[]> {
    const rows = await db.query<{ equipment_id: number; status: string; at: number }>(
      `SELECT s.equipment_id, s.status, s.at FROM equipment_status_events s
       JOIN equipment e ON e.id = s.equipment_id WHERE e.city_id = $1 ORDER BY s.at, s.id`,
      [cityId],
    );
    return rows.map((row) => ({
      equipmentId: row.equipment_id,
      status: row.status as EquipmentStatus,
      at: row.at,
    }));
  }

  async function maintenanceEvents(): Promise<MaintenanceRecord[]> {
    const rows = await db.query<{ equipment_id: number; at: number }>(
      `SELECT m.equipment_id, m.at FROM maintenance_events m
       JOIN equipment e ON e.id = m.equipment_id WHERE e.city_id = $1 ORDER BY m.at, m.id`,
      [cityId],
    );
    return rows.map((row) => ({ equipmentId: row.equipment_id, at: row.at }));
  }

  function model(now: number): Promise<RiskModel> {
    return cached("model", 60_000, now, async () =>
      trainRiskModel(
        await occurrenceRecords(now - HISTORY_DAYS * DAY),
        city.neighborhoods.map((item) => item.id),
        now,
      ),
    );
  }

  function risk(now: number, horizonHours: number): Promise<RiskForecast> {
    return cached(`risk-${horizonHours}`, 60_000, now, async () =>
      forecastRisk(await model(now), city.neighborhoods, await equipment(), now, horizonHours),
    );
  }

  function staffing(now: number, horizonHours: number): Promise<StaffingPlan> {
    return cached(`staffing-${horizonHours}`, 30_000, now, async () =>
      planStaffing(await model(now), city, await listAgents(db, cityId), now, horizonHours),
    );
  }

  async function flowInputs(now: number): Promise<FlowInput[]> {
    const current = startOfHour(now);
    const last = current - HOUR;
    const hours = [current, last];
    for (let week = 1; week <= BASELINE_WEEKS; week += 1) {
      hours.push(current - week * WEEK, last - week * WEEK);
    }
    const rows = await db.query<{ equipment_id: number; hour_start: number; count: number }>(
      `SELECT r.equipment_id, r.hour_start, r.count FROM readings r JOIN equipment e ON e.id = r.equipment_id
       WHERE e.city_id = $1 AND r.hour_start = ANY($2)`,
      [cityId, hours],
    );
    const counts = new Map(rows.map((row) => [`${row.equipment_id}|${row.hour_start}`, row.count]));
    const window = (id: number, hour: number, fraction: number): FlowWindow => ({
      observed: counts.get(`${id}|${hour}`) ?? 0,
      fraction,
      baseline: Array.from({ length: BASELINE_WEEKS }, (_, index) =>
        counts.get(`${id}|${hour - (index + 1) * WEEK}`),
      ).filter((value): value is number => value !== undefined),
    });
    return (await equipment())
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

  function anomalies(now: number): Promise<Anomaly[]> {
    return cached("anomalies", 15_000, now, async () => {
      const riskModel = await model(now);
      const rows = await db.query<{ neighborhood_id: string; total: number }>(
        "SELECT neighborhood_id, COUNT(*) AS total FROM occurrences WHERE city_id = $1 AND created_at >= $2 AND source <> 'history' GROUP BY neighborhood_id",
        [cityId, now - HOUR],
      );
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
      return [...spikes, ...detectFlowAnomalies(await flowInputs(now), now)].sort(
        (a, b) => b.score - a.score,
      );
    });
  }

  function failures(now: number): Promise<FailureRiskReport> {
    return cached("failures", 120_000, now, async () =>
      assessFailureRisk(
        await equipment(),
        await statusEvents(),
        await maintenanceEvents(),
        now,
        HISTORY_DAYS,
      ),
    );
  }

  async function usageRecords(now: number): Promise<UsageRecord[]> {
    const offset = 3 * HOUR;
    const rows = await db.query<{ type: string; day: number; total: number }>(
      `SELECT e.type AS type, (r.hour_start - ${offset}) / ${DAY} AS day, SUM(r.count) AS total
       FROM readings r JOIN equipment e ON e.id = r.equipment_id
       WHERE e.city_id = $1 AND r.hour_start >= $2 GROUP BY e.type, day`,
      [cityId, now - (USAGE_DAYS + 1) * DAY],
    );
    return rows.map((row) => ({
      type: row.type as EquipmentType,
      day: localDate(row.day * DAY + offset + 12 * HOUR),
      total: row.total,
    }));
  }

  async function hourSet(sql: string, params: unknown[]): Promise<Set<number>> {
    const rows = await db.query<{ hour: number }>(sql, params);
    return new Set(rows.map((row) => row.hour));
  }

  async function usageGaps(now: number): Promise<Set<string>> {
    const since = now - (USAGE_DAYS + 1) * DAY;
    const hours = await hourSet(
      `SELECT DISTINCT r.hour_start AS hour FROM readings r JOIN equipment e ON e.id = r.equipment_id
       WHERE e.city_id = $1 AND r.hour_start >= $2`,
      [cityId, since],
    );
    return gapDays(hours, since, now, 0);
  }

  async function occurrenceGaps(now: number): Promise<Set<string>> {
    if (!city.city.simulated) {
      return new Set([localDate(now)]);
    }
    const since = now - 12 * WEEK - DAY;
    const hours = await hourSet(
      "SELECT hour_start AS hour FROM simulation_hours WHERE hour_start >= $1",
      [since],
    );
    return gapDays(hours, since, now, Number((await getSetting(db, "seeded_at")) ?? 0));
  }

  function trends(now: number): Promise<TrendReport> {
    return cached("trends", 120_000, now, async () =>
      buildTrends({
        equipment: await equipment(),
        statusEvents: await statusEvents(),
        occurrences: await occurrenceRecords(now - 12 * WEEK),
        usage: await usageRecords(now),
        usageGaps: await usageGaps(now),
        occurrenceGaps: await occurrenceGaps(now),
        neighborhoods: city.neighborhoods,
        regions: city.regions,
        now,
      }),
    );
  }

  function backtest(now: number): Promise<BacktestResult> {
    return cached("backtest", 600_000, now, async () =>
      backtestRiskModel(
        await occurrenceRecords(now - HISTORY_DAYS * DAY),
        city.neighborhoods,
        now,
        7,
      ),
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
