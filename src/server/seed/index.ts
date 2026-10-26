import {
  EQUIPMENT_TYPES,
  shiftCovers,
  type EquipmentStatus,
  type MaintenanceNeed,
} from "../../shared/catalog.ts";
import { DAY, localDate, localParts } from "../../shared/time.ts";
import type { CityDataset } from "../../shared/types.ts";
import { setSetting, transaction, type Database } from "../db.ts";
import { storeDefaultShapes } from "../neighborhoods.ts";
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
import { createAgents, createInventory } from "./inventory.ts";

export type SeedOptions = { now: number; seed: number; historyDays: number; readingDays: number };

export type SeedSummary = {
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

export function isDatabaseEmpty(db: Database): boolean {
  const row = db.prepare("SELECT COUNT(*) AS total FROM equipment").get() as { total: number };
  return row.total === 0;
}

export function seedDatabase(db: Database, city: CityDataset, options: SeedOptions): SeedSummary {
  const { now, seed, historyDays, readingDays } = options;
  const random = createRandom(seed);
  const windowStart = now - historyDays * DAY;
  const inventory = createInventory(city, random);
  const streetKinds = new Map(city.streets.map((street) => [street.name, street.kind]));

  return transaction(db, () => {
    const insertEquipment = db.prepare(
      `INSERT INTO equipment (type, serial_number, brand, model, agency, status, cep, street, reference,
       neighborhood_id, city, uf, lat, lng, current_lat, current_lng, maintenance_need,
       maintenance_interval_days, last_maintenance_at, next_maintenance_at, maintenance_notes, attributes,
       installed_at, last_seen_at, battery, created_at, updated_at)
       VALUES (:type, :serial, :brand, :model, :agency, :status, :cep, :street, :reference, :neighborhood,
       'Marília', 'SP', :lat, :lng, :lat, :lng, :need, :interval, :last, :next, :notes, :attributes,
       :installed, :seen, :battery, :created, :updated)`,
    );
    const insertEvent = db.prepare(
      "INSERT INTO equipment_status_events (equipment_id, status, reason, at) VALUES (?, ?, ?, ?)",
    );
    const insertMaintenance = db.prepare(
      "INSERT INTO maintenance_events (equipment_id, kind, at) VALUES (?, ?, ?)",
    );
    const insertSite = db.prepare(
      "INSERT INTO sim_flow_sites (equipment_id, base_volume) VALUES (?, ?)",
    );

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

      const result = insertEquipment.run({
        type: item.type,
        serial: item.serialNumber,
        brand: item.brand,
        model: item.model,
        agency: item.agency,
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
      });
      const id = Number(result.lastInsertRowid);

      for (const event of history.events) {
        insertEvent.run(id, event.status, event.reason, Math.round(event.at));
      }
      for (const event of history.maintenance) {
        insertMaintenance.run(id, event.kind, Math.round(event.at));
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
        insertSite.run(id, baseVolume);
        sites.push({ equipmentId: id, type: item.type, baseVolume, events: history.events });
      }
    }

    const { hour } = localParts(now);
    const agents = createAgents(city, random, vehicles);
    for (const agent of agents) {
      const onDuty = shiftCovers(agent.shift, hour);
      createAgent(
        db,
        { ...agent, status: onDuty ? (random.chance(0.15) ? "break" : "available") : "off_duty" },
        now,
      );
    }

    const insertOccurrence = db.prepare(
      `INSERT INTO occurrences (kind, severity, status, source, neighborhood_id, lat, lng, description,
       created_at, resolved_at) VALUES (?, ?, 'resolved', 'history', ?, ?, ?, ?, ?, ?)`,
    );
    let occurrences = 0;
    const model = createDemandModel(city, now);
    for (const item of generateOccurrences(random, city, model, windowStart, now)) {
      const resolvedAt = Math.min(Math.round(item.resolvedAt), now);
      insertOccurrence.run(
        item.kind,
        item.severity,
        item.neighborhoodId,
        item.lat,
        item.lng,
        item.description,
        Math.round(item.createdAt),
        resolvedAt,
      );
      occurrences += 1;
    }

    const insertReading = db.prepare(
      "INSERT INTO readings (equipment_id, hour_start, count) VALUES (?, ?, ?)",
    );
    let readings = 0;
    for (const reading of generateReadings(random, sites, now - readingDays * DAY, now)) {
      insertReading.run(reading.equipmentId, reading.hourStart, reading.count);
      readings += 1;
    }

    setSetting(db, "seeded_at", String(now));
    storeDefaultShapes(db, city, now);
    setSetting(db, "seed", String(seed));

    return { equipment: inventory.length, agents: agents.length, occurrences, readings };
  });
}
