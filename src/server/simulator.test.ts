import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { distanceKm, type LngLat } from "../shared/geo.ts";
import { HOUR, MINUTE, startOfHour } from "../shared/time.ts";
import type { StreamTick } from "../shared/types.ts";
import type { Database } from "./db.ts";
import type { LiveHub } from "./live.ts";
import { createDemandModel } from "./patterns.ts";
import { listAgents } from "./repositories/agents.ts";
import { listEquipment, setEquipmentStatus } from "./repositories/equipment.ts";
import { createTag } from "./repositories/tags.ts";
import { getOccurrence, insertOccurrence } from "./repositories/occurrences.ts";
import type { RoadData } from "./roads.ts";
import { loadMariliaRoads } from "./seed/marilia.ts";
import { createSimulator } from "./simulator.ts";
import { NOW } from "./test-fixtures.ts";
import { seededDatabase } from "./test-database.ts";

const roads = loadMariliaRoads();
const CITY_ID = 1;

const TICK_MS = 2000;
const KM_PER_DEGREE = 111.32;
const ROAD_TOLERANCE_KM = 0.002;

const segments = (() => {
  const data = JSON.parse(
    readFileSync(new URL("../../data/marilia-roads.json", import.meta.url), "utf8"),
  ) as RoadData;
  return data.edges.map(([from, to]) => [data.nodes[from]!, data.nodes[to]!] as const);
})();

function kmToRoad([lng, lat]: LngLat): number {
  const margin = ROAD_TOLERANCE_KM / KM_PER_DEGREE / Math.cos((lat * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (const [start, end] of segments) {
    if (
      lng < Math.min(start[0], end[0]) - margin ||
      lng > Math.max(start[0], end[0]) + margin ||
      lat < Math.min(start[1], end[1]) - margin ||
      lat > Math.max(start[1], end[1]) + margin
    ) {
      continue;
    }
    const scale = Math.cos((lat * Math.PI) / 180);
    const dx = (end[0] - start[0]) * scale;
    const dy = end[1] - start[1];
    const px = (lng - start[0]) * scale;
    const py = lat - start[1];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy) * KM_PER_DEGREE);
  }
  return best;
}

async function assignee(db: Database, id: number): Promise<number | null> {
  return (await getOccurrence(db, CITY_ID, id))!.agentId;
}

function kmh(from: LngLat, to: LngLat): number {
  return distanceKm(from, to) / (TICK_MS / HOUR);
}

async function setup(liveMultiplier = 60) {
  const { db, city } = await seededDatabase();
  const publish = vi.fn<(change: Partial<StreamTick>, now: number) => void>();
  const hub = { publish } as unknown as LiveHub;
  const simulator = createSimulator(db, city, roads, hub, createDemandModel(city, NOW), {
    liveMultiplier,
    tickMs: TICK_MS,
    seed: 3,
    seededAt: NOW,
  });
  return { db, simulator, publish, city };
}

async function run(
  simulator: Awaited<ReturnType<typeof setup>>["simulator"],
  from: number,
  ticks: number,
): Promise<number> {
  let now = from;
  for (let index = 0; index < ticks; index += 1) {
    now += TICK_MS;
    await simulator.tick(now);
  }
  return now;
}

describe("simulator", () => {
  it(
    "creates live occurrences, dispatches agents and resolves them",
    { timeout: 30_000 },
    async () => {
      const { db, simulator, publish } = await setup(240);
      await run(simulator, NOW, 150);
      const rows = (await db.query(
        "SELECT status, COUNT(*) AS total FROM occurrences WHERE source = 'live' GROUP BY status",
        [],
      )) as { status: string; total: number }[];
      const totals = Object.fromEntries(rows.map((row) => [row.status, row.total]));
      expect(totals["resolved"]).toBeGreaterThan(5);
      const assigned = (await db.one(
        "SELECT COUNT(*) AS total FROM occurrences WHERE source = 'live' AND agent_id IS NOT NULL",
        [],
      )) as {
        total: number;
      };
      expect(assigned.total).toBeGreaterThan(0);
      await Promise.resolve();
      expect(publish).toHaveBeenCalled();
      expect(publish.mock.calls.at(-1)![0].agents!.length).toBeGreaterThan(0);
    },
  );

  it("keeps agents consistent with their occurrences", { timeout: 30_000 }, async () => {
    const { db, simulator } = await setup(120);
    await run(simulator, NOW, 150);
    const orphans = (await db.one(
      `SELECT COUNT(*) AS total FROM agents a LEFT JOIN occurrences o ON o.id = a.occurrence_id
         WHERE a.status = 'responding' AND (o.id IS NULL OR o.status = 'resolved')`,
      [],
    )) as { total: number };
    expect(orphans.total).toBe(0);
  });

  it("breaks and repairs equipment over time", { timeout: 30_000 }, async () => {
    const { db, simulator } = await setup(8000);
    await run(simulator, NOW, 100);
    const events = (await db.query(
      "SELECT status, COUNT(*) AS total FROM equipment_status_events WHERE at > $1 GROUP BY status",
      [NOW],
    )) as { status: string; total: number }[];
    const totals = Object.fromEntries(events.map((row) => [row.status, row.total]));
    expect(totals["malfunction"]).toBeGreaterThan(0);
    expect(totals["operational"]).toBeGreaterThan(0);
  });

  it("records every hour it simulated", async () => {
    const { db, simulator } = await setup();
    await run(simulator, NOW, 5);
    await simulator.tick(NOW + 2 * HOUR);
    const hours = (
      (await db.query("SELECT hour_start FROM simulation_hours ORDER BY hour_start", [])) as {
        hour_start: number;
      }[]
    ).map((row) => row.hour_start);
    expect(hours).toEqual([startOfHour(NOW), startOfHour(NOW) + 2 * HOUR]);
  });

  it("replaces stolen equipment after a while", { timeout: 30_000 }, async () => {
    const { db, simulator } = await setup(8000);
    const id = (
      (await db.one("SELECT id FROM equipment WHERE status = 'operational' LIMIT 1", [])) as {
        id: number;
      }
    ).id;
    await setEquipmentStatus(db, id, "stolen", "Furto registrado", NOW, "immediate");
    await run(simulator, NOW, 150);
    const reasons = (
      (await db.query(
        "SELECT reason FROM equipment_status_events WHERE equipment_id = $1 AND at > $2",
        [id, NOW],
      )) as { reason: string }[]
    ).map((row) => row.reason);
    expect(reasons).toContain("Equipamento reposto");
  });

  it(
    "moves agents and vehicles only along streets at realistic speeds",
    { timeout: 60_000 },
    async () => {
      const { db, simulator, publish } = await setup();
      const agentVehicles = new Map(
        (
          (await db.query("SELECT id, vehicle_id FROM agents", [])) as {
            id: number;
            vehicle_id: number | null;
          }[]
        ).map((row) => [row.id, row.vehicle_id]),
      );
      const equipmentTypes = new Map(
        (
          (await db.query("SELECT id, type FROM equipment", [])) as { id: number; type: string }[]
        ).map((row) => [row.id, row.type]),
      );
      await run(simulator, NOW, 300);
      await Promise.resolve();

      const limits: Record<string, number> = {
        foot: 7,
        agent: 65 * 1.3,
        transport_vehicle: 40,
        parking_enforcement_vehicle: 15,
        e_scooter: 20,
      };
      const fastest = new Map<string, number>();
      const previous = new Map<string, { point: LngLat; status: string }>();
      const started = new Set<string>();
      let checked = 0;
      for (const [change] of publish.mock.calls) {
        const entries = [
          ...change.agents!.map((agent) => ({
            key: `agent-${agent.id}`,
            kind: agentVehicles.get(agent.id) === null ? "foot" : "agent",
            point: [agent.lng, agent.lat] as LngLat,
            status: agent.status as string,
          })),
          ...change
            .movingEquipment!.filter((item) => (equipmentTypes.get(item.id) ?? "") in limits)
            .map((item) => ({
              key: `equipment-${item.id}`,
              kind: equipmentTypes.get(item.id)!,
              point: [item.lng, item.lat] as LngLat,
              status: "moving",
            })),
        ];
        for (const entry of entries) {
          const before = previous.get(entry.key);
          previous.set(entry.key, entry);
          if (
            !before ||
            before.status === "off_duty" ||
            entry.status === "off_duty" ||
            distanceKm(before.point, entry.point) === 0
          ) {
            continue;
          }
          expect({ [entry.key]: kmToRoad(entry.point) < ROAD_TOLERANCE_KM }).toEqual({
            [entry.key]: true,
          });
          if (!started.has(entry.key)) {
            started.add(entry.key);
            continue;
          }
          fastest.set(
            entry.kind,
            Math.max(fastest.get(entry.kind) ?? 0, kmh(before.point, entry.point)),
          );
          checked += 1;
        }
      }

      expect(checked).toBeGreaterThan(1000);
      expect(fastest.get("foot")).toBeGreaterThan(3);
      expect(fastest.get("transport_vehicle")).toBeGreaterThan(20);
      for (const [kind, speed] of fastest) {
        expect({ kind, speed: Math.min(speed, limits[kind]! + 0.01) }).toEqual({ kind, speed });
      }
    },
  );

  it("dispatches whoever arrives first and never sends walkers too far", async () => {
    const { db, simulator, city } = await setup(0.0001);
    const scene = roads.point(roads.nearestNode(city.city.center));
    const vehicle = (await db.one(
      "SELECT id FROM equipment WHERE type = 'patrol_vehicle' AND status = 'operational'",
      [],
    )) as { id: number };
    const [walker, driver] = (await db.query("SELECT id FROM agents LIMIT 2", [])) as {
      id: number;
    }[];
    await db.run("UPDATE occurrences SET status = 'resolved', resolved_at = $1", [NOW]);
    await db.run(
      "UPDATE agents SET shift = 'night', status = 'off_duty', occurrence_id = NULL, vehicle_id = NULL",
      [],
    );
    const placeAgent = async (id: number, kmNorth: number, vehicleId: number | null) =>
      await db.run(
        `UPDATE agents SET shift = 'morning', status = 'available', role = 'traffic_agent',
           lat = $1, lng = $2, vehicle_id = $3 WHERE id = $4`,
        [scene[1] + kmNorth / KM_PER_DEGREE, scene[0], vehicleId, id],
      );
    const report = async (at: number) =>
      (
        await insertOccurrence(db, {
          cityId: CITY_ID,
          kind: "accident",
          severity: 2,
          neighborhoodId: "centro",
          lng: scene[0],
          lat: scene[1],
          description: "Teste",
          equipmentId: null,
          source: "live",
          createdAt: at,
        })
      ).id;

    await placeAgent(walker!.id, 1.2, null);
    await placeAgent(driver!.id, -3, vehicle.id);
    const first = await report(NOW);
    await simulator.tick(NOW + TICK_MS);
    expect(await assignee(db, first)).toBe(driver!.id);

    await db.run("UPDATE agents SET shift = 'night', status = 'off_duty' WHERE id = $1", [
      driver!.id,
    ]);
    await db.run("UPDATE occurrences SET status = 'resolved' WHERE id = $1", [first]);
    await placeAgent(walker!.id, 3, null);
    const second = await report(NOW + TICK_MS);
    await simulator.tick(NOW + 2 * TICK_MS);
    expect(await assignee(db, second)).toBeNull();

    await placeAgent(walker!.id, 1.2, null);
    await simulator.tick(NOW + 3 * TICK_MS);
    expect(await assignee(db, second)).toBe(walker!.id);
  });

  it("puts agents on duty when their shift starts", async () => {
    const { db, simulator } = await setup();
    await db.run("UPDATE agents SET status = 'off_duty'", []);
    await simulator.tick(NOW + 2000);
    const onDuty = (await db.query("SELECT shift, status FROM agents", [])) as {
      shift: string;
      status: string;
    }[];
    expect(
      onDuty
        .filter((agent) => agent.shift === "morning")
        .every((agent) => agent.status !== "off_duty"),
    ).toBe(true);
    expect(
      onDuty
        .filter((agent) => agent.shift === "night")
        .every((agent) => agent.status === "off_duty"),
    ).toBe(true);
  });

  it("fills telemetry gaps and keeps counting the current hour", async () => {
    const { db, simulator } = await setup();
    const later = NOW + 5 * HOUR + 30 * MINUTE;
    await simulator.catchUpReadings(later);
    const gap = (await db.one(
      "SELECT COUNT(DISTINCT hour_start) AS hours FROM readings WHERE hour_start >= $1 AND hour_start <= $2",
      [NOW, startOfHour(later)],
    )) as { hours: number };
    expect(gap.hours).toBe(6);
    const before = (await db.one("SELECT SUM(count) AS total FROM readings WHERE hour_start = $1", [
      startOfHour(later),
    ])) as { total: number };
    await run(simulator, later, 30);
    const after = (await db.one("SELECT SUM(count) AS total FROM readings WHERE hour_start = $1", [
      startOfHour(later),
    ])) as { total: number };
    expect(after.total).toBeGreaterThan(before.total);
  });

  it("leaves tagged agents and equipment to their tags", { timeout: 30_000 }, async () => {
    const { db, simulator } = await setup();
    const agent = (await listAgents(db, CITY_ID)).find(
      (item) => item.status === "available" && item.vehicleId !== null,
    )!;
    const equipment = await listEquipment(db, CITY_ID);
    const scooter = equipment.find(
      (item) => item.type === "e_scooter" && item.status === "operational",
    )!;
    const camera = equipment.find(
      (item) => item.type === "camera" && item.status === "operational" && item.installedAt,
    )!;
    for (const target of [
      { kind: "agent" as const, id: agent.id },
      { kind: "equipment" as const, id: scooter.id },
      { kind: "equipment" as const, id: camera.id },
    ]) {
      await createTag(db, target, NOW);
    }
    await db.run("UPDATE equipment SET last_seen_at = $1 WHERE id = $2", [NOW - HOUR, camera.id]);
    const untagged = (await listAgents(db, CITY_ID)).find(
      (item) => item.status === "available" && item.vehicleId !== null && item.id !== agent.id,
    )!;

    await run(simulator, NOW, 120);

    const agentsAfter = new Map((await listAgents(db, CITY_ID)).map((item) => [item.id, item]));
    const equipmentAfter = new Map(
      (await listEquipment(db, CITY_ID)).map((item) => [item.id, item]),
    );
    expect(agentsAfter.get(agent.id)).toMatchObject({ lat: agent.lat, lng: agent.lng });
    expect(equipmentAfter.get(scooter.id)).toMatchObject({
      currentLat: scooter.currentLat,
      currentLng: scooter.currentLng,
    });
    expect(Date.parse(equipmentAfter.get(camera.id)!.lastSeenAt!)).toBe(NOW - HOUR);
    const moved = agentsAfter.get(untagged.id)!;
    expect([moved.lng, moved.lat]).not.toEqual([untagged.lng, untagged.lat]);
  });
});
