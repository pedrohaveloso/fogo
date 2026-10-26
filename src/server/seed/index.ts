import {
  EQUIPMENT_TYPES,
  shiftCovers,
  type EquipmentStatus,
  type MaintenanceNeed,
} from "../../shared/catalog.ts";
import { DAY, localDate, localParts } from "../../shared/time.ts";
import type { CityDataset } from "../../shared/types.ts";
import { insertCity, loadCity } from "../city.ts";
import { insertMany, named, setSetting, type Database, type Queryable } from "../db.ts";
import { createDemandModel } from "../patterns.ts";
import { createRandom } from "../random.ts";
import { createAgent } from "../repositories/agents.ts";
import {
  baseVolumeFor,
  generateOccurrences,
  generateReadings,
  simulateEquipmentHistory,
  type FlowSite,
} from "./history.ts";
import { createAgents, createInventory, SEED_AGENCIES, type SeedAgency } from "./inventory.ts";
import { MARILIA_IBGE_CODE, type CitySource } from "./marilia.ts";

export type SeedOptions = { now: number; seed: number; historyDays: number; readingDays: number };

export type SeedSummary = {
  cityId: number;
  equipment: number;
  agents: number;
  occurrences: number;
  readings: number;
};

function maintenanceNeedFor(status: EquipmentStatus): MaintenanceNeed {
  if (status === "malfunction" || status === "stolen") {
    return "immediate";
  }
  return status === "not_installed" || status === "disabled" ? "none" : "scheduled";
}

function maintenanceNotesFor(status: EquipmentStatus, interval: number): string {
  switch (status) {
    case "malfunction":
      return "Falha detectada pela telemetria. Equipe técnica precisa ir ao local.";
    case "stolen":
      return "Equipamento furtado. Registrar boletim e programar a reposição.";
    case "maintenance":
      return "Manutenção em andamento.";
    case "not_installed":
      return "Aguardando instalação.";
    case "disabled":
      return "Equipamento desativado pela gestão.";
    default:
      return `Manutenção preventiva a cada ${interval} dias.`;
  }
}

export async function isDatabaseEmpty(db: Queryable): Promise<boolean> {
  const row = await db.one<{ total: number }>("SELECT COUNT(*) AS total FROM cities");
  return row!.total === 0;
}

const EQUIPMENT_INSERT = `INSERT INTO equipment (city_id, type, serial_number, brand, model, agency_id, status,
  cep, street, reference, neighborhood_id, lat, lng, current_lat, current_lng, maintenance_need,
  maintenance_interval_days, last_maintenance_at, next_maintenance_at, maintenance_notes, attributes,
  installed_at, last_seen_at, battery, created_at, updated_at)
  VALUES (:city, :type, :serial, :brand, :model, :agency, :status, :cep, :street, :reference,
  :neighborhood, :lat, :lng, :lat, :lng, :need, :interval, :last, :next, :notes, :attributes,
  :installed, :seen, :battery, :created, :updated) RETURNING id`;

export async function importCity(
  db: Queryable,
  source: CitySource,
  now: number,
): Promise<CityDataset> {
  const cityId = await insertCity(
    db,
    {
      name: source.city.name,
      uf: source.city.uf,
      ibgeCode: MARILIA_IBGE_CODE,
      center: source.city.center,
      boundary: source.city.boundary,
      simulated: true,
    },
    now,
  );
  await insertMany(
    db,
    "regions",
    ["id", "city_id", "name", "created_at"],
    source.regions.map((region) => [region.id, cityId, region.name, now]),
  );
  await insertMany(
    db,
    "neighborhoods",
    [
      "id",
      "city_id",
      "region_id",
      "name",
      "polygon",
      "lat",
      "lng",
      "original_polygon",
      "original_lat",
      "original_lng",
      "created_at",
      "updated_at",
    ],
    source.neighborhoods.map((item) => {
      const polygon = JSON.stringify(item.polygon);
      return [
        item.id,
        cityId,
        item.regionId,
        item.name,
        polygon,
        item.lat,
        item.lng,
        polygon,
        item.lat,
        item.lng,
        now,
        now,
      ];
    }),
  );
  await insertMany(
    db,
    "streets",
    ["city_id", "neighborhood_id", "name", "kind", "cep", "lat", "lng"],
    source.streets.map((street) => [
      cityId,
      street.neighborhoodId,
      street.name,
      street.kind,
      street.cep,
      street.lat,
      street.lng,
    ]),
  );
  await insertMany(
    db,
    "pois",
    ["city_id", "neighborhood_id", "name", "kind", "lat", "lng"],
    source.pois.map((poi) => [cityId, poi.neighborhoodId, poi.name, poi.kind, poi.lat, poi.lng]),
  );
  await insertMany(
    db,
    "agencies",
    ["city_id", "name", "created_at"],
    Object.values(SEED_AGENCIES).map((name) => [cityId, name, now]),
  );
  return (await loadCity(db, cityId))!;
}

export async function seedDatabase(
  db: Database,
  source: CitySource,
  options: SeedOptions,
): Promise<SeedSummary> {
  const { now, seed, historyDays, readingDays } = options;
  const random = createRandom(seed);
  const windowStart = now - historyDays * DAY;

  return db.transaction(async (tx) => {
    const city = await importCity(tx, source, now);
    const cityId = city.city.id;
    const agencyIds = Object.fromEntries(
      (Object.keys(SEED_AGENCIES) as SeedAgency[]).map((key) => [
        key,
        city.agencies.find((agency) => agency.name === SEED_AGENCIES[key])!.id,
      ]),
    ) as Record<SeedAgency, number>;
    const inventory = createInventory(city, random);
    const streetKinds = new Map(city.streets.map((street) => [street.name, street.kind]));
    const events: unknown[][] = [];
    const maintenance: unknown[][] = [];
    const siteRows: unknown[][] = [];
    const vehicles: Parameters<typeof createAgents>[2] = [];
    const sites: FlowSite[] = [];

    for (const item of inventory) {
      const spec = EQUIPMENT_TYPES[item.type];
      const interval = spec.maintenanceIntervalDays;
      const installedAt = item.installedDaysAgo === null ? null : now - item.installedDaysAgo * DAY;
      const createdAt = installedAt ?? now - random.int(1, 20) * DAY;
      const history =
        installedAt === null
          ? {
              events: [{ status: "not_installed" as const, at: createdAt, reason: "Cadastro" }],
              maintenance: [],
              lastMaintenanceAt: null,
            }
          : simulateEquipmentHistory(
              random,
              item.type,
              installedAt,
              item.disabled,
              windowStart,
              now,
            );
      const status = history.events.at(-1)!.status;
      const tracksMaintenance = status !== "not_installed" && status !== "disabled";
      const lastMaintenance =
        history.lastMaintenanceAt === null ? null : localDate(history.lastMaintenanceAt);
      const nextMaintenance =
        tracksMaintenance && history.lastMaintenanceAt !== null
          ? localDate(history.lastMaintenanceAt + interval * DAY)
          : null;
      const reporting = status === "operational" || status === "maintenance";

      const row = await tx.one<{ id: number }>(
        ...named(EQUIPMENT_INSERT, {
          city: cityId,
          type: item.type,
          serial: item.serialNumber,
          brand: item.brand,
          model: item.model,
          agency: agencyIds[item.agency],
          status,
          cep: item.cep,
          street: item.street,
          reference: item.reference,
          neighborhood: item.neighborhoodId,
          lat: item.lat,
          lng: item.lng,
          need: maintenanceNeedFor(status),
          interval,
          last: lastMaintenance,
          next: nextMaintenance,
          notes: maintenanceNotesFor(status, interval),
          attributes: JSON.stringify(item.attributes),
          installed: installedAt === null ? null : localDate(installedAt),
          seen: reporting
            ? now - random.int(5, 60) * 1000
            : installedAt === null
              ? null
              : Math.round(history.events.at(-1)!.at),
          battery: item.type === "e_scooter" ? random.int(15, 100) : null,
          created: createdAt,
          updated: Math.round(Math.max(createdAt, history.events.at(-1)!.at)),
        }),
      );
      const id = row!.id;

      for (const event of history.events) {
        events.push([id, event.status, event.reason, Math.round(event.at)]);
      }
      for (const event of history.maintenance) {
        maintenance.push([id, event.kind, Math.round(event.at)]);
      }
      if (item.type === "agent_motorcycle" || item.type === "patrol_vehicle") {
        vehicles.push({ id, type: item.type, agency: item.agency });
      }
      if (spec.telemetry === "flow" || spec.telemetry === "usage") {
        const baseVolume = baseVolumeFor(
          item.type,
          streetKinds.get(item.street) ?? "residential",
          random,
        );
        siteRows.push([id, baseVolume]);
        sites.push({ equipmentId: id, type: item.type, baseVolume, events: history.events });
      }
    }

    await insertMany(
      tx,
      "equipment_status_events",
      ["equipment_id", "status", "reason", "at"],
      events,
    );
    await insertMany(tx, "maintenance_events", ["equipment_id", "kind", "at"], maintenance);
    await insertMany(tx, "sim_flow_sites", ["equipment_id", "base_volume"], siteRows);

    const { hour } = localParts(now);
    const agents = createAgents(city, random, vehicles);
    for (const { agency, ...agent } of agents) {
      const onDuty = shiftCovers(agent.shift, hour);
      await createAgent(
        tx,
        cityId,
        {
          ...agent,
          agencyId: agencyIds[agency],
          status: onDuty ? (random.chance(0.15) ? "break" : "available") : "off_duty",
        },
        now,
      );
    }

    const model = createDemandModel(city, now);
    const occurrenceRows = [...generateOccurrences(random, city, model, windowStart, now)].map(
      (item) => [
        cityId,
        item.kind,
        item.severity,
        "resolved",
        "history",
        item.neighborhoodId,
        item.lat,
        item.lng,
        item.description,
        Math.round(item.createdAt),
        Math.min(Math.round(item.resolvedAt), now),
      ],
    );
    await insertMany(
      tx,
      "occurrences",
      [
        "city_id",
        "kind",
        "severity",
        "status",
        "source",
        "neighborhood_id",
        "lat",
        "lng",
        "description",
        "created_at",
        "resolved_at",
      ],
      occurrenceRows,
    );

    const readingRows = [...generateReadings(random, sites, now - readingDays * DAY, now)].map(
      (reading) => [reading.equipmentId, reading.hourStart, reading.count],
    );
    await insertMany(tx, "readings", ["equipment_id", "hour_start", "count"], readingRows);

    await setSetting(tx, "seeded_at", String(now));
    await setSetting(tx, "seed", String(seed));

    return {
      cityId,
      equipment: inventory.length,
      agents: agents.length,
      occurrences: occurrenceRows.length,
      readings: readingRows.length,
    };
  });
}
