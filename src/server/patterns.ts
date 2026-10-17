import {
  EQUIPMENT_TYPES,
  OCCURRENCE_KIND_KEYS,
  type EquipmentType,
  type OccurrenceKind,
  type Severity,
} from "../shared/catalog.ts";
import { DAY, localParts } from "../shared/time.ts";
import type { CityDataset } from "../shared/types.ts";
import { createRandom } from "./random.ts";

export const SEVERITY_WEIGHTS: Record<OccurrenceKind, Record<Severity, number>> = {
  accident: { 1: 0.35, 2: 0.4, 3: 0.2, 4: 0.05 },
  congestion: { 1: 0.5, 2: 0.4, 3: 0.1, 4: 0 },
  traffic_light_out: { 1: 0, 2: 0.6, 3: 0.4, 4: 0 },
  irregular_parking: { 1: 0.8, 2: 0.2, 3: 0, 4: 0 },
  road_blocked: { 1: 0, 2: 0.5, 3: 0.4, 4: 0.1 },
  public_safety: { 1: 0.2, 2: 0.45, 3: 0.28, 4: 0.07 },
  vandalism: { 1: 0.3, 2: 0.6, 3: 0.1, 4: 0 },
};

export const BASE_DAILY: Record<OccurrenceKind, number> = {
  accident: 6,
  congestion: 9,
  traffic_light_out: 2,
  irregular_parking: 10,
  road_blocked: 2,
  public_safety: 7,
  vandalism: 1.5,
};

const RAW_HOUR_PROFILES: Record<OccurrenceKind, number[]> = {
  accident: [3, 2, 2, 1, 1, 2, 5, 9, 10, 6, 5, 6, 8, 7, 6, 6, 7, 10, 11, 8, 6, 5, 4, 3],
  congestion: [0, 0, 0, 0, 0, 1, 5, 12, 13, 6, 3, 4, 7, 6, 3, 3, 6, 12, 14, 8, 3, 1, 0, 0],
  traffic_light_out: [2, 2, 2, 2, 2, 2, 3, 4, 4, 4, 4, 5, 5, 6, 7, 8, 8, 7, 5, 4, 3, 3, 2, 2],
  irregular_parking: [0, 0, 0, 0, 0, 0, 1, 4, 8, 10, 11, 10, 9, 10, 11, 10, 9, 7, 5, 4, 3, 2, 1, 0],
  road_blocked: [1, 1, 1, 1, 1, 1, 3, 6, 8, 9, 9, 8, 6, 7, 8, 8, 7, 5, 3, 2, 1, 1, 1, 1],
  public_safety: [8, 7, 6, 4, 3, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 5, 6, 7, 8, 9, 10, 11, 11, 10],
  vandalism: [9, 10, 10, 9, 7, 4, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8],
};

const RAW_DOW_FACTORS: Record<OccurrenceKind, number[]> = {
  accident: [0.9, 1, 1, 1, 1.05, 1.2, 1.15],
  congestion: [0.25, 1.15, 1.1, 1.1, 1.15, 1.3, 0.6],
  traffic_light_out: [1, 1, 1, 1, 1, 1, 1],
  irregular_parking: [0.2, 1.2, 1.15, 1.15, 1.2, 1.3, 0.8],
  road_blocked: [0.5, 1.1, 1.1, 1.1, 1.1, 1.1, 0.8],
  public_safety: [1.1, 0.85, 0.85, 0.9, 0.95, 1.2, 1.35],
  vandalism: [1.2, 0.8, 0.8, 0.85, 0.9, 1.2, 1.4],
};

function normalizeMean(values: number[]): number[] {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value / mean);
}

export const HOUR_PROFILES = Object.fromEntries(
  OCCURRENCE_KIND_KEYS.map((kind) => [kind, normalizeMean(RAW_HOUR_PROFILES[kind])]),
) as Record<OccurrenceKind, number[]>;

export const DOW_FACTORS = Object.fromEntries(
  OCCURRENCE_KIND_KEYS.map((kind) => [kind, normalizeMean(RAW_DOW_FACTORS[kind])]),
) as Record<OccurrenceKind, number[]>;

function weekendNightBoost(kind: OccurrenceKind, dow: number, hour: number): number {
  if (kind !== "accident" && kind !== "public_safety") {
    return 1;
  }
  const lateFriday = dow === 5 && hour >= 22;
  const lateSaturday = (dow === 6 && (hour >= 22 || hour <= 3)) || (dow === 0 && hour <= 3);
  return lateFriday || lateSaturday ? 1.8 : 1;
}

function hashString(text: string): number {
  let hash = 2166136261;
  for (const char of text) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  }
  return hash >>> 0;
}

export type DemandModel = {
  weights: Map<string, Record<OccurrenceKind, number>>;
  trending: Set<string>;
  rate: (neighborhoodId: string, kind: OccurrenceKind, ms: number) => number;
  neighborhoodRate: (neighborhoodId: string, ms: number) => number;
};

export const TREND_WINDOW_DAYS = 35;
const TREND_MAX_GROWTH = 1.2;
const TREND_CANDIDATES = 12;
const TRENDING_NEIGHBORHOODS = 3;

export function createDemandModel(city: CityDataset, seededAt: number): DemandModel {
  const weights = new Map<string, Record<OccurrenceKind, number>>();
  const raw = new Map<string, Record<OccurrenceKind, number>>();

  for (const neighborhood of city.neighborhoods) {
    const random = createRandom(hashString(neighborhood.id));
    const pois = city.pois.filter((poi) => poi.neighborhoodId === neighborhood.id);
    const streets = city.streets.filter((street) => street.neighborhoodId === neighborhood.id);
    const count = (kinds: string[]) => pois.filter((poi) => kinds.includes(poi.kind)).length;
    const majorRoads = streets.filter((street) =>
      ["trunk", "primary", "secondary"].includes(street.kind),
    ).length;
    const commerce = count(["mall", "supermarket", "bank"]);
    const education = count(["school", "university"]);
    const isCenter = neighborhood.id === "centro" ? 1 : 0;
    const noise = () => Math.exp(random.normal(0, 0.35));
    const hotspot = random.chance(0.12) ? 2.2 : 1;

    raw.set(neighborhood.id, {
      accident: (1 + majorRoads * 0.8 + commerce * 0.3 + isCenter * 3) * noise(),
      congestion:
        (0.5 + majorRoads * 0.9 + commerce * 0.8 + education * 0.6 + isCenter * 6) * noise(),
      traffic_light_out: (1 + majorRoads * 0.6 + isCenter * 2) * noise(),
      irregular_parking: (0.4 + commerce * 1.2 + education * 0.5 + isCenter * 9) * noise(),
      road_blocked: (1 + majorRoads * 0.5 + isCenter * 2) * noise(),
      public_safety: (1 + commerce * 0.3 + isCenter * 2) * noise() * hotspot,
      vandalism: (1 + isCenter * 1.5) * noise() * hotspot,
    });
  }

  for (const kind of OCCURRENCE_KIND_KEYS) {
    const total = [...raw.values()].reduce((sum, item) => sum + item[kind], 0);
    for (const [id, item] of raw) {
      const entry = weights.get(id) ?? ({} as Record<OccurrenceKind, number>);
      entry[kind] = item[kind] / total;
      weights.set(id, entry);
    }
  }

  const trendRandom = createRandom(hashString("trend"));
  const volume = (id: string) =>
    OCCURRENCE_KIND_KEYS.reduce(
      (sum, kind) => sum + BASE_DAILY[kind] * (weights.get(id)?.[kind] ?? 0),
      0,
    );
  const candidates = city.neighborhoods
    .filter((item) => item.regionId === "west" || item.regionId === "south")
    .sort((a, b) => volume(b.id) - volume(a.id))
    .slice(0, TREND_CANDIDATES);
  const trending = new Set<string>();
  while (trending.size < Math.min(TRENDING_NEIGHBORHOODS, candidates.length)) {
    trending.add(trendRandom.pick(candidates).id);
  }

  const trendStart = seededAt - TREND_WINDOW_DAYS * DAY;
  const growth = (neighborhoodId: string, ms: number) => {
    if (!trending.has(neighborhoodId) || ms <= trendStart) {
      return 1;
    }
    return 1 + Math.min(1, (ms - trendStart) / (TREND_WINDOW_DAYS * DAY)) * TREND_MAX_GROWTH;
  };

  const rate = (neighborhoodId: string, kind: OccurrenceKind, ms: number) => {
    const weight = weights.get(neighborhoodId)?.[kind] ?? 0;
    const { dow, hour } = localParts(ms);
    return (
      (BASE_DAILY[kind] / 24) *
      weight *
      HOUR_PROFILES[kind][hour]! *
      DOW_FACTORS[kind][dow]! *
      weekendNightBoost(kind, dow, hour) *
      growth(neighborhoodId, ms)
    );
  };

  const neighborhoodRate = (neighborhoodId: string, ms: number) =>
    OCCURRENCE_KIND_KEYS.reduce((sum, kind) => sum + rate(neighborhoodId, kind, ms), 0);

  return { weights, trending, rate, neighborhoodRate };
}

export const FAILURE_RATE_PER_DAY: Record<EquipmentType, number> = {
  radar: 1 / 220,
  camera: 1 / 160,
  truck_scale: 1 / 140,
  smart_traffic_light: 1 / 200,
  automated_gate: 1 / 110,
  parking_kiosk: 1 / 80,
  parking_enforcement_vehicle: 1 / 90,
  transport_vehicle: 1 / 150,
  e_scooter: 1 / 55,
  agent_motorcycle: 1 / 120,
  patrol_vehicle: 1 / 130,
  variable_message_sign: 1 / 250,
};

export const OVERDUE_FAILURE_MULTIPLIER = 3;
export const AGING_WINDOW_DAYS = 60;
export const AGING_MAX_EXTRA = 1.4;

export function agingFactor(type: EquipmentType, ms: number, seededAt: number): number {
  if (type !== "e_scooter") {
    return 1;
  }
  const start = seededAt - AGING_WINDOW_DAYS * DAY;
  return 1 + Math.min(1.5, Math.max(0, (ms - start) / (AGING_WINDOW_DAYS * DAY))) * AGING_MAX_EXTRA;
}

export function failureRatePerDay(
  type: EquipmentType,
  daysSinceMaintenance: number,
  aging: number,
): number {
  const interval = EQUIPMENT_TYPES[type].maintenanceIntervalDays;
  const overdue = daysSinceMaintenance > interval;
  return FAILURE_RATE_PER_DAY[type] * (overdue ? OVERDUE_FAILURE_MULTIPLIER : 1) * aging;
}

export function hourlyFlowProfile(hour: number, dow: number): number {
  const weekday = [
    0.15, 0.08, 0.05, 0.05, 0.1, 0.35, 0.8, 1.6, 1.7, 1.2, 1, 1.05, 1.2, 1.15, 1, 1.05, 1.25, 1.7,
    1.8, 1.3, 0.9, 0.65, 0.45, 0.3,
  ];
  const weekend = [
    0.35, 0.25, 0.18, 0.12, 0.1, 0.15, 0.3, 0.5, 0.7, 0.9, 1, 1.1, 1.15, 1.1, 1, 1, 1, 1, 0.95,
    0.85, 0.75, 0.65, 0.55, 0.45,
  ];
  return (dow === 0 || dow === 6 ? weekend : weekday)[hour] ?? 1;
}
