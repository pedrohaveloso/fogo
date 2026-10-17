import {
  EQUIPMENT_TYPES,
  OCCURRENCE_KINDS,
  OCCURRENCE_KIND_KEYS,
  shiftCovers,
  type AgentRole,
  type OccurrenceKind,
} from "../shared/catalog.ts";
import { distanceKm, moveTowards, type LngLat } from "../shared/geo.ts";
import {
  DAY,
  HOUR,
  MINUTE,
  addDays,
  daysBetween,
  localDate,
  localParts,
  startOfHour,
} from "../shared/time.ts";
import type {
  Agent,
  AgentPosition,
  CityDataset,
  Equipment,
  EquipmentPosition,
  Occurrence,
} from "../shared/types.ts";
import { transaction, type Database } from "./db.ts";
import type { LiveHub } from "./live.ts";
import { agingFactor, failureRatePerDay, type DemandModel } from "./patterns.ts";
import { createRandom, type Random } from "./random.ts";
import { listAgents } from "./repositories/agents.ts";
import {
  completeMaintenance,
  getEquipment,
  listEquipment,
  setEquipmentStatus,
} from "./repositories/equipment.ts";
import {
  assignOccurrence,
  getOccurrence,
  insertOccurrence,
  listActiveOccurrences,
  resolveOccurrence,
} from "./repositories/occurrences.ts";
import {
  baseVolumeFor,
  expectedReading,
  occurrenceLocation,
  pickSeverity,
} from "./seed/history.ts";
import { OCCURRENCE_DESCRIPTIONS } from "./seed/texts.ts";

export type SimulatorOptions = {
  liveMultiplier: number;
  movementSpeedup: number;
  tickMs: number;
  seed: number;
  seededAt: number;
};

const PATROL_KMH = 12;
const RESPONSE_KMH = 45;
const VEHICLE_KMH = 25;
const MAX_TICK_MS = 10_000;
const ARRIVAL_KM = 0.03;
const STALE_OCCURRENCE_MS = 3 * HOUR;
const CATCH_UP_HOURS = 48;
const ANOMALY_MIN_VOLUME = 150;

const DISPATCH_ROLES: Record<OccurrenceKind, AgentRole[]> = {
  accident: ["traffic_agent", "military_police", "municipal_guard"],
  congestion: [],
  traffic_light_out: ["traffic_agent"],
  irregular_parking: ["traffic_agent"],
  road_blocked: ["traffic_agent", "municipal_guard"],
  public_safety: ["military_police", "municipal_guard"],
  vandalism: ["municipal_guard", "military_police"],
};

type Repair = { phase: "malfunction" | "maintenance"; until: number; preventive: boolean };
type FlowOverride = { mode: "stuck" | "spike"; until: number };
type Burst = { neighborhoodId: string; kind: OccurrenceKind; remaining: number };

export type Simulator = ReturnType<typeof createSimulator>;

export function createSimulator(
  db: Database,
  city: CityDataset,
  hub: LiveHub,
  demand: DemandModel,
  options: SimulatorOptions,
) {
  const random: Random = createRandom(options.seed);
  const multiplier = options.liveMultiplier;
  const targets = new Map<string, LngLat>();
  const arrivals = new Map<number, number>();
  const silent = new Map<number, number>();
  const overrides = new Map<number, FlowOverride>();
  const repairs = new Map<number, Repair>();
  const baseVolumes = new Map<number, number>();
  let burst: Burst | null = null;
  let lastTick = 0;
  let lastShiftHour = -1;
  let timer: ReturnType<typeof setInterval> | null = null;

  for (const row of db.prepare("SELECT equipment_id, base_volume FROM sim_flow_sites").all() as {
    equipment_id: number;
    base_volume: number;
  }[]) {
    baseVolumes.set(row.equipment_id, row.base_volume);
  }

  const streetPoints = city.streets.map((street): LngLat => [street.lng, street.lat]);
  const streetsByRegion = new Map<string, LngLat[]>();
  for (const street of city.streets) {
    const region =
      city.neighborhoods.find((item) => item.id === street.neighborhoodId)?.regionId ?? "center";
    const list = streetsByRegion.get(region) ?? [];
    list.push([street.lng, street.lat]);
    streetsByRegion.set(region, list);
  }
  const regionOf = new Map(city.neighborhoods.map((item) => [item.id, item.regionId]));

  const kmPerMs = (kmh: number) => (kmh * options.movementSpeedup) / HOUR;
  const perTick = (meanIntervalMs: number, dt: number) => random.chance(dt / meanIntervalMs);

  function patrolTarget(key: string, regionId: string | null): LngLat {
    const existing = targets.get(key);
    if (existing) {
      return existing;
    }
    const pool = (regionId && streetsByRegion.get(regionId)) || streetPoints;
    const [lng, lat] = random.pick(pool);
    const target: LngLat = [lng + random.normal(0, 0.0008), lat + random.normal(0, 0.0008)];
    targets.set(key, target);
    return target;
  }

  function flowVolume(item: Equipment): number {
    const known = baseVolumes.get(item.id);
    if (known !== undefined) {
      return known;
    }
    const volume = baseVolumeFor(item.type, "residential", random);
    db.prepare(
      "INSERT OR REPLACE INTO sim_flow_sites (equipment_id, base_volume) VALUES (?, ?)",
    ).run(item.id, volume);
    baseVolumes.set(item.id, volume);
    return volume;
  }

  function addReading(id: number, hourStart: number, count: number): void {
    if (count <= 0) {
      db.prepare(
        "INSERT OR IGNORE INTO readings (equipment_id, hour_start, count) VALUES (?, ?, 0)",
      ).run(id, hourStart);
      return;
    }
    db.prepare(
      `INSERT INTO readings (equipment_id, hour_start, count) VALUES (?, ?, ?)
       ON CONFLICT (equipment_id, hour_start) DO UPDATE SET count = count + excluded.count`,
    ).run(id, hourStart, count);
  }

  function sampleCount(expected: number): number {
    return expected < 30
      ? random.poisson(expected)
      : Math.max(0, Math.round(random.normal(expected, Math.sqrt(expected))));
  }

  function catchUpReadings(now: number): void {
    const current = startOfHour(now);
    transaction(db, () => {
      for (const item of listEquipment(db)) {
        const telemetry = EQUIPMENT_TYPES[item.type].telemetry;
        if ((telemetry !== "flow" && telemetry !== "usage") || item.status !== "operational") {
          continue;
        }
        const site = { type: item.type, baseVolume: flowVolume(item) };
        const row = db
          .prepare("SELECT MAX(hour_start) AS last FROM readings WHERE equipment_id = ?")
          .get(item.id) as {
          last: number | null;
        };
        const from = Math.max((row.last ?? current - HOUR) + HOUR, current - CATCH_UP_HOURS * HOUR);
        for (let hour = from; hour < current; hour += HOUR) {
          addReading(item.id, hour, sampleCount(expectedReading(site, hour)));
        }
        const existing = db
          .prepare("SELECT count FROM readings WHERE equipment_id = ? AND hour_start = ?")
          .get(item.id, current) as { count: number } | undefined;
        if (!existing) {
          addReading(
            item.id,
            current,
            sampleCount(expectedReading(site, current) * ((now - current) / HOUR)),
          );
        }
      }
    });
  }

  function createOccurrence(
    now: number,
    neighborhoodId: string,
    kind: OccurrenceKind,
    equipment: Equipment[],
  ): Occurrence {
    let equipmentId: number | null = null;
    const location = occurrenceLocation(random, city, neighborhoodId);
    if (kind === "vandalism" || kind === "traffic_light_out") {
      const candidates = equipment.filter(
        (item) =>
          item.neighborhoodId === neighborhoodId &&
          item.status === "operational" &&
          !EQUIPMENT_TYPES[item.type].mobile &&
          (kind === "vandalism" || item.type === "smart_traffic_light"),
      );
      if (candidates.length > 0) {
        const target = random.pick(candidates);
        equipmentId = target.id;
        location.lat = target.lat;
        location.lng = target.lng;
        if (kind === "traffic_light_out" || random.chance(0.6)) {
          setEquipmentStatus(
            db,
            target.id,
            "malfunction",
            kind === "vandalism" ? "Vandalismo" : "Semáforo apagado",
            now,
            "immediate",
          );
          repairs.set(target.id, {
            phase: "malfunction",
            until: now + ((0.3 + random.next()) * DAY) / multiplier,
            preventive: false,
          });
        }
      }
    }
    return insertOccurrence(db, {
      kind,
      severity: pickSeverity(random, kind),
      neighborhoodId,
      ...location,
      description: random.pick(OCCURRENCE_DESCRIPTIONS[kind]),
      equipmentId,
      source: "live",
      createdAt: now,
    });
  }

  function tick(now: number): void {
    const dt = lastTick === 0 ? options.tickMs : Math.min(Math.max(now - lastTick, 0), MAX_TICK_MS);
    lastTick = now;
    const { hour } = localParts(now);
    const today = localDate(now);
    const changedEquipment = new Set<number>();
    const changedOccurrences = new Set<number>();

    transaction(db, () => {
      const agents = listAgents(db);
      const equipment = listEquipment(db);
      const byId = new Map(equipment.map((item) => [item.id, item]));

      if (hour !== lastShiftHour) {
        lastShiftHour = hour;
        for (const agent of agents) {
          const onDuty = shiftCovers(agent.shift, hour);
          if (!onDuty && (agent.status === "available" || agent.status === "break")) {
            updateAgent(agent, { status: "off_duty" }, now);
          } else if (onDuty && agent.status === "off_duty") {
            updateAgent(agent, { status: "available" }, now);
          }
        }
      }

      for (const agent of agents) {
        if (agent.status === "available" && perTick(40 * MINUTE, dt)) {
          updateAgent(agent, { status: "break" }, now);
        } else if (agent.status === "break" && perTick(4 * MINUTE, dt)) {
          updateAgent(agent, { status: "available" }, now);
        }
      }

      const active = listActiveOccurrences(db);
      for (const neighborhood of city.neighborhoods) {
        for (const kind of OCCURRENCE_KIND_KEYS) {
          const count = random.poisson(
            (demand.rate(neighborhood.id, kind, now) * multiplier * dt) / HOUR,
          );
          for (let index = 0; index < count; index += 1) {
            const occurrence = createOccurrence(now, neighborhood.id, kind, equipment);
            active.push(occurrence);
            changedOccurrences.add(occurrence.id);
            if (occurrence.equipmentId !== null) {
              changedEquipment.add(occurrence.equipmentId);
            }
          }
        }
      }

      if (!burst && perTick(8 * MINUTE, dt)) {
        const quiet = city.neighborhoods.filter(
          (item) => demand.neighborhoodRate(item.id, now) * multiplier < 1.2,
        );
        if (quiet.length > 0) {
          burst = {
            neighborhoodId: random.pick(quiet).id,
            kind: random.pick(["accident", "public_safety"] as const),
            remaining: random.int(4, 5),
          };
        }
      }
      if (burst && random.chance(0.6)) {
        const occurrence = createOccurrence(now, burst.neighborhoodId, burst.kind, equipment);
        active.push(occurrence);
        changedOccurrences.add(occurrence.id);
        burst.remaining -= 1;
        if (burst.remaining <= 0) {
          burst = null;
        }
      }

      const freshAgents = listAgents(db);
      const agentById = new Map(freshAgents.map((agent) => [agent.id, agent]));
      for (const occurrence of active) {
        if (occurrence.status !== "open") {
          continue;
        }
        const roles = DISPATCH_ROLES[occurrence.kind];
        const age = now - Date.parse(occurrence.createdAt);
        if (roles.length === 0) {
          if (
            age >=
            (OCCURRENCE_KINDS[occurrence.kind].handlingMinutes * 2 * MINUTE) / multiplier
          ) {
            resolveOccurrence(db, occurrence.id, now);
            changedOccurrences.add(occurrence.id);
          }
          continue;
        }
        if (age >= STALE_OCCURRENCE_MS) {
          resolveOccurrence(db, occurrence.id, now);
          changedOccurrences.add(occurrence.id);
          continue;
        }
        const point: LngLat = [occurrence.lng, occurrence.lat];
        const candidates = [...agentById.values()].filter((agent) => agent.status === "available");
        const preferred = candidates.filter((agent) => roles.includes(agent.role));
        const pool = preferred.length > 0 ? preferred : occurrence.severity >= 3 ? candidates : [];
        if (pool.length === 0) {
          continue;
        }
        const nearest = pool.reduce((best, agent) =>
          distanceKm([agent.lng, agent.lat], point) < distanceKm([best.lng, best.lat], point)
            ? agent
            : best,
        );
        assignOccurrence(db, occurrence.id, nearest.id);
        db.prepare(
          "UPDATE agents SET status = 'responding', occurrence_id = ?, updated_at = ? WHERE id = ?",
        ).run(occurrence.id, now, nearest.id);
        agentById.set(nearest.id, {
          ...nearest,
          status: "responding",
          occurrenceId: occurrence.id,
        });
        changedOccurrences.add(occurrence.id);
      }

      const positions: AgentPosition[] = [];
      const moving: EquipmentPosition[] = [];
      const updateAgentPosition = db.prepare(
        "UPDATE agents SET lat = ?, lng = ?, last_seen_at = ? WHERE id = ?",
      );
      const updateVehicle = db.prepare(
        "UPDATE equipment SET current_lat = ?, current_lng = ?, last_seen_at = ? WHERE id = ?",
      );

      for (const agent of agentById.values()) {
        let position: LngLat = [agent.lng, agent.lat];
        if (agent.status === "responding" && agent.occurrenceId !== null) {
          const occurrence = getOccurrence(db, agent.occurrenceId);
          if (!occurrence || occurrence.status === "resolved") {
            db.prepare(
              "UPDATE agents SET status = 'available', occurrence_id = NULL, updated_at = ? WHERE id = ?",
            ).run(now, agent.id);
            agent.status = "available";
            agent.occurrenceId = null;
          } else {
            const destination: LngLat = [occurrence.lng, occurrence.lat];
            position = moveTowards(position, destination, kmPerMs(RESPONSE_KMH) * dt);
            if (distanceKm(position, destination) <= ARRIVAL_KM) {
              const arrivedAt = arrivals.get(occurrence.id) ?? now;
              arrivals.set(occurrence.id, arrivedAt);
              if (
                now - arrivedAt >=
                (OCCURRENCE_KINDS[occurrence.kind].handlingMinutes * MINUTE) / multiplier
              ) {
                resolveOccurrence(db, occurrence.id, now);
                arrivals.delete(occurrence.id);
                changedOccurrences.add(occurrence.id);
                db.prepare(
                  "UPDATE agents SET status = 'available', occurrence_id = NULL, updated_at = ? WHERE id = ?",
                ).run(now, agent.id);
                agent.status = "available";
                agent.occurrenceId = null;
              }
            }
          }
        } else if (agent.status === "available") {
          const key = `agent-${agent.id}`;
          const target = patrolTarget(key, regionOf.get(agent.baseNeighborhoodId) ?? null);
          position = moveTowards(position, target, kmPerMs(PATROL_KMH) * dt);
          if (distanceKm(position, target) <= ARRIVAL_KM) {
            targets.delete(key);
          }
        }
        if (position[0] !== agent.lng || position[1] !== agent.lat || agent.status !== "off_duty") {
          updateAgentPosition.run(position[1], position[0], now, agent.id);
        }
        positions.push({
          id: agent.id,
          lat: position[1],
          lng: position[0],
          status: agent.status,
          occurrenceId: agent.occurrenceId,
        });
        const vehicle = agent.vehicleId === null ? undefined : byId.get(agent.vehicleId);
        if (vehicle && vehicle.status === "operational" && agent.status !== "off_duty") {
          updateVehicle.run(position[1], position[0], now, vehicle.id);
          moving.push({
            id: vehicle.id,
            lat: position[1],
            lng: position[0],
            battery: vehicle.battery,
          });
        }
      }

      const assignedVehicles = new Set(
        freshAgents.map((agent) => agent.vehicleId).filter((id) => id !== null),
      );
      for (const item of equipment) {
        if (
          !EQUIPMENT_TYPES[item.type].mobile ||
          item.status !== "operational" ||
          assignedVehicles.has(item.id)
        ) {
          continue;
        }
        let position: LngLat = [item.currentLng ?? item.lng, item.currentLat ?? item.lat];
        let battery = item.battery;
        if (item.type === "e_scooter") {
          if (random.chance(0.25)) {
            const target = patrolTarget(
              `equipment-${item.id}`,
              regionOf.get(item.neighborhoodId) ?? null,
            );
            position = moveTowards(position, target, kmPerMs(15) * dt);
            if (distanceKm(position, target) <= ARRIVAL_KM) {
              targets.delete(`equipment-${item.id}`);
            }
            battery = Math.max(0, (battery ?? 100) - random.next() * 0.6);
          } else if ((battery ?? 100) < 10 && random.chance(0.05)) {
            battery = 100;
          }
        } else if (
          item.type === "transport_vehicle" ||
          item.type === "parking_enforcement_vehicle"
        ) {
          const target = patrolTarget(
            `equipment-${item.id}`,
            item.type === "parking_enforcement_vehicle" ? "center" : null,
          );
          position = moveTowards(position, target, kmPerMs(VEHICLE_KMH) * dt);
          if (distanceKm(position, target) <= ARRIVAL_KM) {
            targets.delete(`equipment-${item.id}`);
          }
        } else {
          continue;
        }
        db.prepare(
          "UPDATE equipment SET current_lat = ?, current_lng = ?, battery = ? WHERE id = ?",
        ).run(position[1], position[0], battery, item.id);
        moving.push({ id: item.id, lat: position[1], lng: position[0], battery });
      }

      for (const [id, until] of silent) {
        if (now < until) {
          continue;
        }
        silent.delete(id);
        if (random.chance(0.5) && byId.get(id)?.status === "operational") {
          setEquipmentStatus(
            db,
            id,
            "malfunction",
            "Perda de comunicação confirmada",
            now,
            "immediate",
          );
          repairs.set(id, {
            phase: "malfunction",
            until: now + ((0.5 + random.next() * 2) * DAY) / multiplier,
            preventive: false,
          });
          changedEquipment.add(id);
        }
      }
      if (perTick(6 * MINUTE, dt)) {
        const candidates = equipment.filter(
          (item) =>
            item.status === "operational" &&
            !EQUIPMENT_TYPES[item.type].mobile &&
            item.installedAt !== null &&
            !silent.has(item.id),
        );
        if (candidates.length > 0) {
          silent.set(random.pick(candidates).id, now + random.int(4, 10) * MINUTE);
        }
      }

      const silentIds = [...silent.keys()];
      db.prepare(
        `UPDATE equipment SET last_seen_at = ? WHERE status IN ('operational', 'maintenance') AND installed_at IS NOT NULL
         ${silentIds.length > 0 ? `AND id NOT IN (${silentIds.join(",")})` : ""}`,
      ).run(now);

      for (const item of equipment) {
        if (item.status === "malfunction" || item.status === "maintenance") {
          if (!repairs.has(item.id)) {
            repairs.set(item.id, {
              phase: item.status,
              until:
                now +
                ((item.status === "malfunction"
                  ? 0.5 + random.next() * 2
                  : 0.2 + random.next() * 0.8) *
                  DAY) /
                  multiplier,
              preventive: false,
            });
          }
          continue;
        }
        if (item.status !== "operational" || item.installedAt === null || silent.has(item.id)) {
          continue;
        }
        const daysSince =
          item.lastMaintenanceAt === null ? 0 : daysBetween(item.lastMaintenanceAt, today);
        const rate = failureRatePerDay(
          item.type,
          daysSince,
          agingFactor(item.type, now, options.seededAt),
        );
        if (random.chance((rate * multiplier * dt) / DAY)) {
          setEquipmentStatus(
            db,
            item.id,
            "malfunction",
            "Falha detectada pela telemetria",
            now,
            "immediate",
          );
          db.prepare("UPDATE equipment SET maintenance_notes = ? WHERE id = ?").run(
            "Falha detectada pela telemetria. Equipe técnica precisa ir ao local.",
            item.id,
          );
          repairs.set(item.id, {
            phase: "malfunction",
            until: now + ((0.5 + random.next() * 3) * DAY) / multiplier,
            preventive: false,
          });
          changedEquipment.add(item.id);
        }
      }

      for (const [id, repair] of repairs) {
        if (now < repair.until) {
          continue;
        }
        const item = getEquipment(db, id);
        if (!item || (item.status !== "malfunction" && item.status !== "maintenance")) {
          repairs.delete(id);
          continue;
        }
        if (repair.phase === "malfunction") {
          setEquipmentStatus(db, id, "maintenance", "Equipe técnica iniciou o reparo", now);
          repairs.set(id, {
            phase: "maintenance",
            until: now + ((4 + random.next() * 26) * HOUR) / multiplier,
            preventive: false,
          });
        } else {
          setEquipmentStatus(
            db,
            id,
            "operational",
            repair.preventive ? "Manutenção preventiva concluída" : "Reparo concluído",
            now,
          );
          const interval =
            item.maintenanceIntervalDays ?? EQUIPMENT_TYPES[item.type].maintenanceIntervalDays;
          completeMaintenance(db, id, today, addDays(today, interval), now);
          db.prepare("UPDATE equipment SET maintenance_notes = ? WHERE id = ?").run(
            `Manutenção preventiva a cada ${interval} dias.`,
            id,
          );
          repairs.delete(id);
        }
        changedEquipment.add(id);
      }

      if (perTick(5 * MINUTE, dt)) {
        const due = equipment.filter(
          (item) =>
            item.status === "operational" &&
            item.nextMaintenanceAt !== null &&
            item.nextMaintenanceAt <= today,
        );
        if (due.length > 0) {
          const item = random.pick(due);
          setEquipmentStatus(db, item.id, "maintenance", "Manutenção preventiva", now, "scheduled");
          repairs.set(item.id, {
            phase: "maintenance",
            until: now + ((2 + random.next() * 4) * HOUR) / multiplier,
            preventive: true,
          });
          changedEquipment.add(item.id);
        }
      }

      if (perTick(60 * MINUTE, dt)) {
        const candidates = equipment.filter(
          (item) =>
            item.status === "operational" &&
            ["camera", "e_scooter", "parking_kiosk"].includes(item.type),
        );
        if (candidates.length > 0) {
          const item = random.pick(candidates);
          setEquipmentStatus(db, item.id, "stolen", "Furto registrado", now, "immediate");
          db.prepare("UPDATE equipment SET maintenance_notes = ? WHERE id = ?").run(
            "Equipamento furtado. Registrar boletim e programar a reposição.",
            item.id,
          );
          changedEquipment.add(item.id);
        }
      }

      const hourStart = startOfHour(now);
      const flowItems = equipment.filter((item) => {
        const telemetry = EQUIPMENT_TYPES[item.type].telemetry;
        return (
          (telemetry === "flow" || telemetry === "usage") &&
          item.status === "operational" &&
          !silent.has(item.id)
        );
      });
      if (perTick(7 * MINUTE, dt)) {
        const candidates = flowItems.filter(
          (item) => flowVolume(item) >= ANOMALY_MIN_VOLUME && !overrides.has(item.id),
        );
        if (candidates.length > 0) {
          overrides.set(random.pick(candidates).id, {
            mode: random.chance(0.6) ? "stuck" : "spike",
            until: now + random.int(15, 25) * MINUTE,
          });
        }
      }
      for (const item of flowItems) {
        const override = overrides.get(item.id);
        if (override && now >= override.until) {
          overrides.delete(item.id);
        }
        const current = overrides.get(item.id);
        const expected =
          (expectedReading({ type: item.type, baseVolume: flowVolume(item) }, hourStart) * dt) /
          HOUR;
        const factor = current?.mode === "stuck" ? 0 : current?.mode === "spike" ? 3 : 1;
        addReading(item.id, hourStart, sampleCount(expected * factor));
      }

      for (const id of changedEquipment) {
        if (!byId.has(id)) {
          changedEquipment.delete(id);
        }
      }

      const equipmentChanges = [...changedEquipment]
        .map((id) => getEquipment(db, id))
        .filter((item): item is Equipment => item !== null);
      const occurrenceChanges = [...changedOccurrences]
        .map((id) => getOccurrence(db, id))
        .filter((item): item is Occurrence => item !== null);

      queueMicrotask(() =>
        hub.publish(
          {
            agents: positions,
            movingEquipment: moving,
            equipment: equipmentChanges,
            occurrences: occurrenceChanges,
          },
          now,
        ),
      );
    });
  }

  function updateAgent(agent: Agent, change: { status: Agent["status"] }, now: number): void {
    db.prepare("UPDATE agents SET status = ?, updated_at = ? WHERE id = ?").run(
      change.status,
      now,
      agent.id,
    );
    agent.status = change.status;
    if (change.status === "off_duty") {
      const base = city.neighborhoods.find((item) => item.id === agent.baseNeighborhoodId);
      if (base) {
        db.prepare("UPDATE agents SET lat = ?, lng = ? WHERE id = ?").run(
          base.lat,
          base.lng,
          agent.id,
        );
        agent.lat = base.lat;
        agent.lng = base.lng;
      }
    }
  }

  return {
    tick,
    catchUpReadings,
    start: () => {
      catchUpReadings(Date.now());
      timer = setInterval(() => tick(Date.now()), options.tickMs);
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    silentEquipment: () => new Set(silent.keys()),
  };
}
