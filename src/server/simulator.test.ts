import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { distanceKm, type LngLat } from "../shared/geo.ts";
import { HOUR, MINUTE, startOfHour } from "../shared/time.ts";
import type { StreamTick } from "../shared/types.ts";
import { city, roads } from "./city.ts";
import { openDatabase, type Database } from "./db.ts";
import type { LiveHub } from "./live.ts";
import { createDemandModel } from "./patterns.ts";
import { setEquipmentStatus } from "./repositories/equipment.ts";
import { getOccurrence, insertOccurrence } from "./repositories/occurrences.ts";
import type { RoadData } from "./roads.ts";
import { seedDatabase } from "./seed/index.ts";
import { createSimulator } from "./simulator.ts";
import { NOW } from "./test-fixtures.ts";

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

function assignee(db: Database, id: number): number | null {
  return getOccurrence(db, id)!.agentId;
}

function kmh(from: LngLat, to: LngLat): number {
  return distanceKm(from, to) / (TICK_MS / HOUR);
}

function setup(liveMultiplier = 60) {
  const db = openDatabase(":memory:");
  seedDatabase(db, city, { now: NOW, seed: 5, historyDays: 30, readingDays: 2 });
  const publish = vi.fn<(change: Partial<StreamTick>, now: number) => void>();
  const hub = { publish } as unknown as LiveHub;
  const simulator = createSimulator(db, city, roads, hub, createDemandModel(city, NOW), {
    liveMultiplier,
    tickMs: TICK_MS,
    seed: 3,
    seededAt: NOW,
  });
  return { db, simulator, publish };
}

function run(
  simulator: ReturnType<typeof setup>["simulator"],
  from: number,
  ticks: number,
): number {
  let now = from;
  for (let index = 0; index < ticks; index += 1) {
    now += TICK_MS;
    simulator.tick(now);
  }
  return now;
}

describe("simulator", () => {
  it(
    "creates live occurrences, dispatches agents and resolves them",
    { timeout: 30_000 },
    async () => {
      const { db, simulator, publish } = setup();
      run(simulator, NOW, 600);
      const rows = db
        .prepare(
          "SELECT status, COUNT(*) AS total FROM occurrences WHERE source = 'live' GROUP BY status",
        )
        .all() as { status: string; total: number }[];
      const totals = Object.fromEntries(rows.map((row) => [row.status, row.total]));
      expect(totals["resolved"]).toBeGreaterThan(5);
      const assigned = db
        .prepare(
          "SELECT COUNT(*) AS total FROM occurrences WHERE source = 'live' AND agent_id IS NOT NULL",
        )
        .get() as {
        total: number;
      };
      expect(assigned.total).toBeGreaterThan(0);
      await Promise.resolve();
      expect(publish).toHaveBeenCalled();
      expect(publish.mock.calls.at(-1)![0].agents!.length).toBeGreaterThan(0);
    },
  );

  it("keeps agents consistent with their occurrences", { timeout: 30_000 }, () => {
    const { db, simulator } = setup();
    run(simulator, NOW, 300);
    const orphans = db
      .prepare(
        `SELECT COUNT(*) AS total FROM agents a LEFT JOIN occurrences o ON o.id = a.occurrence_id
         WHERE a.status = 'responding' AND (o.id IS NULL OR o.status = 'resolved')`,
      )
      .get() as { total: number };
    expect(orphans.total).toBe(0);
  });

  it("breaks and repairs equipment over time", { timeout: 30_000 }, () => {
    const { db, simulator } = setup(2000);
    run(simulator, NOW, 400);
    const events = db
      .prepare(
        "SELECT status, COUNT(*) AS total FROM equipment_status_events WHERE at > ? GROUP BY status",
      )
      .all(NOW) as { status: string; total: number }[];
    const totals = Object.fromEntries(events.map((row) => [row.status, row.total]));
    expect(totals["malfunction"]).toBeGreaterThan(0);
    expect(totals["operational"]).toBeGreaterThan(0);
  });

  it("records every hour it simulated", () => {
    const { db, simulator } = setup();
    run(simulator, NOW, 5);
    simulator.tick(NOW + 2 * HOUR);
    const hours = (
      db.prepare("SELECT hour_start FROM simulation_hours ORDER BY hour_start").all() as {
        hour_start: number;
      }[]
    ).map((row) => row.hour_start);
    expect(hours).toEqual([startOfHour(NOW), startOfHour(NOW) + 2 * HOUR]);
  });

  it("replaces stolen equipment after a while", { timeout: 30_000 }, () => {
    const { db, simulator } = setup(2000);
    const id = (
      db.prepare("SELECT id FROM equipment WHERE status = 'operational' LIMIT 1").get() as {
        id: number;
      }
    ).id;
    setEquipmentStatus(db, id, "stolen", "Furto registrado", NOW, "immediate");
    run(simulator, NOW, 600);
    const reasons = (
      db
        .prepare("SELECT reason FROM equipment_status_events WHERE equipment_id = ? AND at > ?")
        .all(id, NOW) as { reason: string }[]
    ).map((row) => row.reason);
    expect(reasons).toContain("Equipamento reposto");
  });

  it(
    "moves agents and vehicles only along streets at realistic speeds",
    { timeout: 60_000 },
    async () => {
      const { db, simulator, publish } = setup();
      const agentVehicles = new Map(
        (
          db.prepare("SELECT id, vehicle_id FROM agents").all() as {
            id: number;
            vehicle_id: number | null;
          }[]
        ).map((row) => [row.id, row.vehicle_id]),
      );
      const equipmentTypes = new Map(
        (db.prepare("SELECT id, type FROM equipment").all() as { id: number; type: string }[]).map(
          (row) => [row.id, row.type],
        ),
      );
      run(simulator, NOW, 300);
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

  it("dispatches whoever arrives first and never sends walkers too far", () => {
    const { db, simulator } = setup(0.0001);
    const scene = roads.point(roads.nearestNode(city.city.center));
    const vehicle = db
      .prepare("SELECT id FROM equipment WHERE type = 'patrol_vehicle' AND status = 'operational'")
      .get() as { id: number };
    const [walker, driver] = db.prepare("SELECT id FROM agents LIMIT 2").all() as {
      id: number;
    }[];
    db.prepare("UPDATE occurrences SET status = 'resolved', resolved_at = ?").run(NOW);
    db.prepare(
      "UPDATE agents SET shift = 'night', status = 'off_duty', occurrence_id = NULL, vehicle_id = NULL",
    ).run();
    const placeAgent = (id: number, kmNorth: number, vehicleId: number | null) =>
      db
        .prepare(
          `UPDATE agents SET shift = 'morning', status = 'available', role = 'traffic_agent',
           lat = ?, lng = ?, vehicle_id = ? WHERE id = ?`,
        )
        .run(scene[1] + kmNorth / KM_PER_DEGREE, scene[0], vehicleId, id);
    const report = (at: number) =>
      insertOccurrence(db, {
        kind: "accident",
        severity: 2,
        neighborhoodId: "centro",
        lng: scene[0],
        lat: scene[1],
        description: "Teste",
        equipmentId: null,
        source: "live",
        createdAt: at,
      }).id;

    placeAgent(walker!.id, 1.2, null);
    placeAgent(driver!.id, -3, vehicle.id);
    const first = report(NOW);
    simulator.tick(NOW + TICK_MS);
    expect(assignee(db, first)).toBe(driver!.id);

    db.prepare("UPDATE agents SET shift = 'night', status = 'off_duty' WHERE id = ?").run(
      driver!.id,
    );
    db.prepare("UPDATE occurrences SET status = 'resolved' WHERE id = ?").run(first);
    placeAgent(walker!.id, 3, null);
    const second = report(NOW + TICK_MS);
    simulator.tick(NOW + 2 * TICK_MS);
    expect(assignee(db, second)).toBeNull();

    placeAgent(walker!.id, 1.2, null);
    simulator.tick(NOW + 3 * TICK_MS);
    expect(assignee(db, second)).toBe(walker!.id);
  });

  it("puts agents on duty when their shift starts", () => {
    const { db, simulator } = setup();
    db.prepare("UPDATE agents SET status = 'off_duty'").run();
    simulator.tick(NOW + 2000);
    const onDuty = db.prepare("SELECT shift, status FROM agents").all() as {
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

  it("fills telemetry gaps and keeps counting the current hour", () => {
    const { db, simulator } = setup();
    const later = NOW + 5 * HOUR + 30 * MINUTE;
    simulator.catchUpReadings(later);
    const gap = db
      .prepare(
        "SELECT COUNT(DISTINCT hour_start) AS hours FROM readings WHERE hour_start >= ? AND hour_start <= ?",
      )
      .get(NOW, startOfHour(later)) as { hours: number };
    expect(gap.hours).toBe(6);
    const before = db
      .prepare("SELECT SUM(count) AS total FROM readings WHERE hour_start = ?")
      .get(startOfHour(later)) as { total: number };
    run(simulator, later, 30);
    const after = db
      .prepare("SELECT SUM(count) AS total FROM readings WHERE hour_start = ?")
      .get(startOfHour(later)) as { total: number };
    expect(after.total).toBeGreaterThan(before.total);
  });
});
