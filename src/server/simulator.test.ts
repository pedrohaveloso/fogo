import { describe, expect, it, vi } from "vitest";
import { HOUR, MINUTE, startOfHour } from "../shared/time.ts";
import type { StreamTick } from "../shared/types.ts";
import { city } from "./city.ts";
import { openDatabase } from "./db.ts";
import type { LiveHub } from "./live.ts";
import { createDemandModel } from "./patterns.ts";
import { seedDatabase } from "./seed/index.ts";
import { createSimulator } from "./simulator.ts";
import { NOW } from "./test-fixtures.ts";

function setup(liveMultiplier = 60) {
  const db = openDatabase(":memory:");
  seedDatabase(db, city, { now: NOW, seed: 5, historyDays: 30, readingDays: 2 });
  const publish = vi.fn<(change: Partial<StreamTick>, now: number) => void>();
  const hub = { publish } as unknown as LiveHub;
  const simulator = createSimulator(db, city, hub, createDemandModel(city, NOW), {
    liveMultiplier,
    movementSpeedup: 6,
    tickMs: 2000,
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
    now += 2000;
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
