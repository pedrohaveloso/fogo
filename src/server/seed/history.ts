import {
  EQUIPMENT_TYPES,
  OCCURRENCE_KINDS,
  OCCURRENCE_KIND_KEYS,
  type EquipmentStatus,
  type EquipmentType,
  type OccurrenceKind,
  type Severity,
} from "../../shared/catalog.ts";
import { DAY, HOUR, localParts, startOfHour, startOfLocalDay } from "../../shared/time.ts";
import type { CityDataset } from "../../shared/types.ts";
import type { DemandModel } from "../patterns.ts";
import {
  SEVERITY_WEIGHTS,
  agingFactor,
  failureRatePerDay,
  hourlyFlowProfile,
} from "../patterns.ts";
import type { Random } from "../random.ts";
import { OCCURRENCE_DESCRIPTIONS } from "./texts.ts";

export type StatusEvent = { status: EquipmentStatus; at: number; reason: string };
export type MaintenanceEvent = { kind: "preventive" | "corrective"; at: number };

export type EquipmentHistory = {
  events: StatusEvent[];
  maintenance: MaintenanceEvent[];
  lastMaintenanceAt: number | null;
};

const THEFT_PRONE = new Set<EquipmentType>(["camera", "e_scooter", "parking_kiosk"]);
const THEFT_RATE_PER_DAY = 1 / 2500;

export function simulateEquipmentHistory(
  random: Random,
  type: EquipmentType,
  installedAt: number,
  disabled: boolean,
  windowStart: number,
  now: number,
): EquipmentHistory {
  const interval = EQUIPMENT_TYPES[type].maintenanceIntervalDays;
  const delayDays = random.chance(0.3) ? random.int(15, 90) : 0;
  const start = Math.max(windowStart, installedAt);
  let lastMaintenance = start - random.int(0, interval) * DAY;
  const events: StatusEvent[] = [
    { status: "operational", at: start, reason: "Instalação/início do histórico" },
  ];
  const maintenance: MaintenanceEvent[] = [];
  const disabledAt = disabled ? start + random.next() * (now - start) : Number.POSITIVE_INFINITY;
  let busyUntil = start;

  const push = (status: EquipmentStatus, at: number, reason: string) => {
    if (at <= now) {
      events.push({ status, at, reason });
    }
  };

  for (let day = startOfLocalDay(start) + DAY; day < now; day += DAY) {
    if (day >= disabledAt) {
      push("disabled", disabledAt, "Desativado pela gestão");
      break;
    }
    if (day < busyUntil) {
      continue;
    }
    const daysSince = (day - lastMaintenance) / DAY;
    const tolerance = delayDays > 0 ? delayDays : random.int(-5, 5);
    if (daysSince >= interval + tolerance) {
      const begin = day + (8 + random.next() * 6) * HOUR;
      const end = begin + (2 + random.next() * 5) * HOUR;
      push("maintenance", begin, "Manutenção preventiva");
      push("operational", end, "Manutenção preventiva concluída");
      if (begin <= now) {
        maintenance.push({ kind: "preventive", at: begin });
        lastMaintenance = begin;
      }
      busyUntil = end;
      continue;
    }
    if (THEFT_PRONE.has(type) && random.chance(THEFT_RATE_PER_DAY)) {
      push("stolen", day + random.next() * DAY, "Furto registrado");
      break;
    }
    const rate = failureRatePerDay(type, daysSince, agingFactor(type, day, now));
    if (random.chance(rate)) {
      const failure = day + random.next() * DAY;
      const repairStart = failure + (0.5 + random.next() * 3.5) * DAY;
      const repairEnd = repairStart + (4 + random.next() * 26) * HOUR;
      push("malfunction", failure, "Falha detectada pela telemetria");
      push("maintenance", repairStart, "Manutenção corretiva");
      push("operational", repairEnd, "Reparo concluído");
      if (repairStart <= now) {
        maintenance.push({ kind: "corrective", at: repairStart });
        lastMaintenance = repairStart;
      }
      busyUntil = repairEnd;
    }
  }

  return { events, maintenance, lastMaintenanceAt: lastMaintenance };
}

export function statusAt(events: StatusEvent[], at: number): EquipmentStatus {
  let status: EquipmentStatus = "not_installed";
  for (const event of events) {
    if (event.at > at) {
      break;
    }
    status = event.status;
  }
  return status;
}

export type FlowSite = {
  equipmentId: number;
  type: EquipmentType;
  baseVolume: number;
  events: StatusEvent[];
};

function usageProfile(type: EquipmentType, hour: number, dow: number): number {
  if (type === "parking_kiosk") {
    const open =
      dow >= 1 && dow <= 5 ? hour >= 8 && hour < 18 : dow === 6 && hour >= 8 && hour < 13;
    return open ? 1 + (hour === 10 || hour === 15 ? 0.4 : 0) : 0;
  }
  return hourlyFlowProfile(hour, dow);
}

export function baseVolumeFor(type: EquipmentType, streetKind: string, random: Random): number {
  const major = streetKind === "trunk" || streetKind === "primary";
  switch (type) {
    case "radar":
    case "smart_traffic_light":
      return major ? random.int(700, 1200) : random.int(300, 650);
    case "camera":
      return random.int(150, 700);
    case "truck_scale":
      return random.int(20, 60);
    case "automated_gate":
      return random.int(15, 60);
    case "parking_kiosk":
      return random.int(5, 18);
    default:
      return 0;
  }
}

export function expectedReading(
  site: Pick<FlowSite, "type" | "baseVolume">,
  hourStart: number,
): number {
  const { dow, hour } = localParts(hourStart);
  return site.baseVolume * usageProfile(site.type, hour, dow);
}

export function simulateReading(
  random: Random,
  site: Pick<FlowSite, "type" | "baseVolume">,
  hourStart: number,
): number {
  const expected = expectedReading(site, hourStart);
  if (expected < 30) {
    return random.poisson(expected);
  }
  return Math.max(0, Math.round(expected * Math.exp(random.normal(0, 0.1))));
}

export function* generateReadings(
  random: Random,
  sites: FlowSite[],
  from: number,
  to: number,
): Generator<{ equipmentId: number; hourStart: number; count: number }> {
  for (let hourStart = startOfHour(from); hourStart < startOfHour(to); hourStart += HOUR) {
    for (const site of sites) {
      if (statusAt(site.events, hourStart + HOUR / 2) !== "operational") {
        continue;
      }
      yield {
        equipmentId: site.equipmentId,
        hourStart,
        count: simulateReading(random, site, hourStart),
      };
    }
  }
}

export type HistoricOccurrence = {
  kind: OccurrenceKind;
  severity: Severity;
  neighborhoodId: string;
  lat: number;
  lng: number;
  description: string;
  createdAt: number;
  resolvedAt: number;
};

export function pickSeverity(random: Random, kind: OccurrenceKind): Severity {
  const weights = SEVERITY_WEIGHTS[kind];
  return random.weighted([1, 2, 3, 4] as const, (severity) => weights[severity]);
}

export function occurrenceLocation(
  random: Random,
  city: CityDataset,
  neighborhoodId: string,
): { lat: number; lng: number } {
  const streets = city.streets.filter((street) => street.neighborhoodId === neighborhoodId);
  const neighborhood = city.neighborhoods.find((item) => item.id === neighborhoodId)!;
  const anchor = streets.length > 0 ? random.pick(streets) : neighborhood;
  const spread = streets.length > 0 ? 150 : 300;
  return {
    lat: Number((anchor.lat + random.normal(0, spread / 111_000)).toFixed(6)),
    lng: Number((anchor.lng + random.normal(0, spread / 111_000)).toFixed(6)),
  };
}

export function* generateOccurrences(
  random: Random,
  city: CityDataset,
  model: DemandModel,
  from: number,
  to: number,
): Generator<HistoricOccurrence> {
  for (let hourStart = startOfHour(from); hourStart < to; hourStart += HOUR) {
    for (const neighborhood of city.neighborhoods) {
      for (const kind of OCCURRENCE_KIND_KEYS) {
        const count = random.poisson(model.rate(neighborhood.id, kind, hourStart));
        for (let index = 0; index < count; index += 1) {
          const createdAt = hourStart + random.next() * HOUR;
          if (createdAt >= to) {
            continue;
          }
          const handling =
            OCCURRENCE_KINDS[kind].handlingMinutes * Math.exp(random.normal(0, 0.35));
          yield {
            kind,
            severity: pickSeverity(random, kind),
            neighborhoodId: neighborhood.id,
            ...occurrenceLocation(random, city, neighborhood.id),
            description: random.pick(OCCURRENCE_DESCRIPTIONS[kind]),
            createdAt,
            resolvedAt: createdAt + (10 + handling) * 60_000,
          };
        }
      }
    }
  }
}
