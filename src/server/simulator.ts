import {
  EQUIPMENT_TYPES,
  OCCURRENCE_KINDS,
  OCCURRENCE_KIND_KEYS,
  shiftCovers,
  type AgentRole,
  type OccurrenceKind,
} from "../shared/catalog.ts";
import { distanceKm, type LngLat } from "../shared/geo.ts";
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
import {
  advance,
  placeOnRoad,
  setDestination,
  type Journey,
  type RoadNetwork,
  type TravelMode,
} from "./roads.ts";
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
  THEFT_PRONE,
  THEFT_RATE_PER_DAY,
  baseVolumeFor,
  expectedReading,
  occurrenceLocation,
  pickSeverity,
  replacementDays,
} from "./seed/history.ts";
import { OCCURRENCE_DESCRIPTIONS } from "./seed/texts.ts";

export type SimulatorOptions = {
  liveMultiplier: number;
  tickMs: number;
  seed: number;
  seededAt: number;
};

const MAX_TICK_MS = 10_000;
const STALE_OCCURRENCE_MS = 3 * HOUR;
const CATCH_UP_HOURS = 48;
const ANOMALY_MIN_VOLUME = 150;
const COMMUNICATION_FAILURE_CHANCE = 0.15;

const DISPATCH_ROLES: Record<OccurrenceKind, AgentRole[]> = {
  accident: ["traffic_agent", "military_police", "municipal_guard"],
  congestion: [],
  traffic_light_out: ["traffic_agent"],
  irregular_parking: ["traffic_agent"],
  road_blocked: ["traffic_agent", "municipal_guard"],
  public_safety: ["military_police", "municipal_guard"],
  vandalism: ["municipal_guard", "military_police"],
};

const ON_FOOT = Number.POSITIVE_INFINITY;

const AGENT_MODES = {
  foot: {
    patrol: { kmh: 4.5, followsOneWay: false, limitFactor: ON_FOOT },
    response: { kmh: 7, followsOneWay: false, limitFactor: ON_FOOT },
    rest: [2, 6],
  },
  car: {
    patrol: { kmh: 30, followsOneWay: true, limitFactor: 1 },
    response: { kmh: 60, followsOneWay: true, limitFactor: 1.2 },
    rest: [1, 4],
  },
  motorcycle: {
    patrol: { kmh: 30, followsOneWay: true, limitFactor: 1 },
    response: { kmh: 65, followsOneWay: true, limitFactor: 1.3 },
    rest: [1, 4],
  },
} as const satisfies Record<
  string,
  { patrol: TravelMode; response: TravelMode; rest: RestMinutes }
>;

const TAXI: TravelMode = { kmh: 40, followsOneWay: true, limitFactor: 1 };
const TAXI_REST: RestMinutes = [1, 5];
const ENFORCEMENT: TravelMode = { kmh: 15, followsOneWay: true, limitFactor: 1 };
const ENFORCEMENT_REST: RestMinutes = [0.5, 2];
const SCOOTER_KMH = 20;
const SCOOTER_REST: RestMinutes = [10, 45];
const SCOOTER_TRIP_KM = 2.5;
const SCOOTER_BATTERY_PER_KM = 3;
const SCOOTER_MIN_BATTERY = 15;
const FOOT_PATROL_KM = 1;
const MAX_RESPONSE_MS = 20 * MINUTE;
const RESYNC_KM = 0.05;

type RestMinutes = readonly [number, number];

function agentVehicle(agent: Agent, byId: Map<number, Equipment>): Equipment | undefined {
  const vehicle = agent.vehicleId === null ? undefined : byId.get(agent.vehicleId);
  return vehicle?.status === "operational" ? vehicle : undefined;
}

function agentModes(vehicle: Equipment | undefined) {
  if (!vehicle) {
    return AGENT_MODES.foot;
  }
  return vehicle.type === "agent_motorcycle" || vehicle.attributes["vehicleKind"] === "motorcycle"
    ? AGENT_MODES.motorcycle
    : AGENT_MODES.car;
}

type Repair = {
  phase: "malfunction" | "maintenance" | "stolen";
  until: number;
  preventive: boolean;
};
type FlowOverride = { mode: "stuck" | "spike"; until: number };
type Burst = { neighborhoodId: string; kind: OccurrenceKind; remaining: number };

export type Simulator = ReturnType<typeof createSimulator>;

export function createSimulator(
  db: Database,
  city: CityDataset,
  roads: RoadNetwork,
  hub: LiveHub,
  demand: DemandModel,
  options: SimulatorOptions,
) {
  const random: Random = createRandom(options.seed);
  const multiplier = options.liveMultiplier;
  const journeys = new Map<string, Journey>();
  const resting = new Map<string, number>();
  const arrivals = new Map<number, number>();
  const silent = new Map<number, number>();
  const overrides = new Map<number, FlowOverride>();
  const repairs = new Map<number, Repair>();
  const baseVolumes = new Map<number, number>();
  let burst: Burst | null = null;
  let lastTick = 0;
  let lastSimulatedHour = 0;
  let lastShiftHour = -1;
  let timer: ReturnType<typeof setInterval> | null = null;

  for (const row of db.prepare("SELECT equipment_id, base_volume FROM sim_flow_sites").all() as {
    equipment_id: number;
    base_volume: number;
  }[]) {
    baseVolumes.set(row.equipment_id, row.base_volume);
  }

  const regionOf = new Map(city.neighborhoods.map((item) => [item.id, item.regionId]));
  const allNodes = Array.from({ length: roads.nodeCount }, (_, index) => index);
  const nodesByRegion = new Map<string, number[]>();
  for (const node of allNodes) {
    const point = roads.point(node);
    const owner = city.neighborhoods.reduce((best, item) =>
      distanceKm(point, [item.lng, item.lat]) < distanceKm(point, [best.lng, best.lat])
        ? item
        : best,
    );
    const list = nodesByRegion.get(owner.regionId) ?? [];
    list.push(node);
    nodesByRegion.set(owner.regionId, list);
  }
  const regionNodes = (regionId: string | undefined) =>
    (regionId && nodesByRegion.get(regionId)) || allNodes;

  const perTick = (meanIntervalMs: number, dt: number) => random.chance(dt / meanIntervalMs);

  function onRoad(point: LngLat): LngLat {
    return roads.point(roads.nearestNode(point));
  }

  function journeyFor(key: string, position: LngLat): Journey {
    const existing = journeys.get(key);
    if (existing && distanceKm(existing.position, position) <= RESYNC_KM) {
      return existing;
    }
    const journey = placeOnRoad(roads, position);
    journeys.set(key, journey);
    resting.delete(key);
    return journey;
  }

  function roam(
    key: string,
    position: LngLat,
    mode: TravelMode,
    dt: number,
    now: number,
    [minRest, maxRest]: RestMinutes,
    destinations: (from: LngLat) => readonly number[],
  ): number {
    const previous = journeys.get(key);
    const journey = journeyFor(key, position);
    if (journey.path.length === 0) {
      const until = resting.get(key);
      if (until === undefined) {
        const phase = journey === previous ? 1 : random.next();
        resting.set(key, now + phase * (minRest + random.next() * (maxRest - minRest)) * MINUTE);
        return 0;
      }
      if (now < until) {
        return 0;
      }
      resting.delete(key);
      setDestination(roads, journey, random.pick(destinations(journey.position)), mode);
    }
    return advance(roads, journey, mode, dt);
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
    const sampled = occurrenceLocation(random, city, neighborhoodId);
    const [lng, lat] = onRoad([sampled.lng, sampled.lat]);
    const location = { lat, lng };
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
      if (startOfHour(now) !== lastSimulatedHour) {
        lastSimulatedHour = startOfHour(now);
        db.prepare("INSERT OR IGNORE INTO simulation_hours (hour_start) VALUES (?)").run(
          lastSimulatedHour,
        );
      }
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
        const etaHours = (agent: Agent) =>
          distanceKm([agent.lng, agent.lat], point) /
          agentModes(agentVehicle(agent, byId)).response.kmh;
        const candidates = [...agentById.values()].filter(
          (agent) => agent.status === "available" && etaHours(agent) * HOUR <= MAX_RESPONSE_MS,
        );
        const preferred = candidates.filter((agent) => roles.includes(agent.role));
        const pool = preferred.length > 0 ? preferred : occurrence.severity >= 3 ? candidates : [];
        if (pool.length === 0) {
          continue;
        }
        const nearest = pool.reduce((best, agent) =>
          etaHours(agent) < etaHours(best) ? agent : best,
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
        const key = `agent-${agent.id}`;
        const vehicle = agentVehicle(agent, byId);
        const modes = agentModes(vehicle);
        if (agent.status === "responding" && agent.occurrenceId !== null) {
          const occurrence = getOccurrence(db, agent.occurrenceId);
          if (!occurrence || occurrence.status === "resolved") {
            db.prepare(
              "UPDATE agents SET status = 'available', occurrence_id = NULL, updated_at = ? WHERE id = ?",
            ).run(now, agent.id);
            agent.status = "available";
            agent.occurrenceId = null;
          } else {
            const journey = journeyFor(key, position);
            const destination = roads.nearestNode([occurrence.lng, occurrence.lat]);
            if (journey.destination !== destination) {
              setDestination(roads, journey, destination, modes.response);
            }
            resting.delete(key);
            advance(roads, journey, modes.response, dt);
            position = journey.position;
            if (journey.path.length === 0) {
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
          roam(key, position, modes.patrol, dt, now, modes.rest, (from) =>
            vehicle
              ? regionNodes(regionOf.get(agent.baseNeighborhoodId))
              : roads.nodesWithin(from, FOOT_PATROL_KM),
          );
          position = journeys.get(key)!.position;
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
        if (vehicle && agent.status !== "off_duty") {
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
        const key = `equipment-${item.id}`;
        const stored: LngLat = [item.currentLng ?? item.lng, item.currentLat ?? item.lat];
        let battery = item.battery;
        if (item.type === "e_scooter") {
          const parked = (journeys.get(key)?.path.length ?? 0) === 0;
          if (parked && (battery ?? 100) < SCOOTER_MIN_BATTERY) {
            if (perTick(30 * MINUTE, dt)) {
              battery = 100;
            }
          } else {
            const maxSpeed = item.attributes["maxSpeed"];
            const mode: TravelMode = {
              kmh: typeof maxSpeed === "number" ? Math.min(maxSpeed, SCOOTER_KMH) : SCOOTER_KMH,
              followsOneWay: true,
              limitFactor: 1,
            };
            const km = roam(key, stored, mode, dt, now, SCOOTER_REST, (from) =>
              roads.nodesWithin(from, SCOOTER_TRIP_KM),
            );
            battery = Math.max(0, (battery ?? 100) - km * SCOOTER_BATTERY_PER_KM);
          }
        } else if (item.type === "transport_vehicle") {
          roam(key, stored, TAXI, dt, now, TAXI_REST, () => allNodes);
        } else if (item.type === "parking_enforcement_vehicle") {
          roam(key, stored, ENFORCEMENT, dt, now, ENFORCEMENT_REST, () => regionNodes("center"));
        } else {
          continue;
        }
        const position = journeys.get(key)?.position ?? stored;
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
        if (random.chance(COMMUNICATION_FAILURE_CHANCE) && byId.get(id)?.status === "operational") {
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
        if (
          item.status === "malfunction" ||
          item.status === "maintenance" ||
          item.status === "stolen"
        ) {
          if (!repairs.has(item.id)) {
            const days = {
              malfunction: 0.5 + random.next() * 2,
              maintenance: 0.2 + random.next() * 0.8,
              stolen: replacementDays(random),
            }[item.status];
            repairs.set(item.id, {
              phase: item.status,
              until: now + (days * DAY) / multiplier,
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
        if (item?.status !== repair.phase) {
          repairs.delete(id);
          continue;
        }
        if (repair.phase === "stolen") {
          setEquipmentStatus(db, id, "operational", "Equipamento reposto", now, "none");
          const interval =
            item.maintenanceIntervalDays ?? EQUIPMENT_TYPES[item.type].maintenanceIntervalDays;
          completeMaintenance(db, id, today, addDays(today, interval), now);
          db.prepare("UPDATE equipment SET maintenance_notes = ? WHERE id = ?").run(
            "Equipamento novo instalado no lugar do furtado.",
            id,
          );
          repairs.delete(id);
        } else if (repair.phase === "malfunction") {
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

      for (const item of equipment) {
        if (
          item.status === "operational" &&
          THEFT_PRONE.has(item.type) &&
          random.chance((THEFT_RATE_PER_DAY * multiplier * dt) / DAY)
        ) {
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
        const [lng, lat] = onRoad([base.lng, base.lat]);
        db.prepare("UPDATE agents SET lat = ?, lng = ? WHERE id = ?").run(lat, lng, agent.id);
        agent.lat = lat;
        agent.lng = lng;
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
