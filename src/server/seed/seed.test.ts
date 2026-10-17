import { describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES } from "../../shared/catalog.ts";
import { addDays } from "../../shared/time.ts";
import { city } from "../city.ts";
import { getSetting, openDatabase } from "../db.ts";
import { listAgents } from "../repositories/agents.ts";
import { listEquipment } from "../repositories/equipment.ts";
import { NOW } from "../test-fixtures.ts";
import { isDatabaseEmpty, seedDatabase } from "./index.ts";

function seeded(seed: number) {
  const db = openDatabase(":memory:");
  const summary = seedDatabase(db, city, { now: NOW, seed, historyDays: 60, readingDays: 2 });
  return { db, summary };
}

describe("seedDatabase", () => {
  it("creates a consistent inventory placed in known neighborhoods", () => {
    const { db, summary } = seeded(1);
    expect(isDatabaseEmpty(db)).toBe(false);
    expect(summary.equipment).toBeGreaterThan(250);
    expect(summary.occurrences).toBeGreaterThan(1000);
    const neighborhoods = new Set(city.neighborhoods.map((item) => item.id));
    const items = listEquipment(db);
    expect(items.filter((item) => !neighborhoods.has(item.neighborhoodId))).toEqual([]);
    expect(
      items.filter((item) => (item.status === "not_installed") !== (item.installedAt === null)),
    ).toEqual([]);
    expect(
      items.filter(
        (item) =>
          item.lastMaintenanceAt !== null &&
          item.nextMaintenanceAt !== null &&
          item.nextMaintenanceAt !==
            addDays(item.lastMaintenanceAt, EQUIPMENT_TYPES[item.type].maintenanceIntervalDays),
      ),
    ).toEqual([]);
    expect(getSetting(db, "seeded_at")).toBe(String(NOW));
  });

  it("links vehicles to at most one agent of the right agency", () => {
    const { db } = seeded(2);
    const equipment = new Map(listEquipment(db).map((item) => [item.id, item]));
    const vehicles = listAgents(db)
      .filter((agent) => agent.vehicleId !== null)
      .map((agent) => ({ agent, vehicle: equipment.get(agent.vehicleId!)! }));
    expect(new Set(vehicles.map((item) => item.vehicle.id)).size).toBe(vehicles.length);
    expect(
      vehicles.filter(
        ({ agent, vehicle }) =>
          !["agent_motorcycle", "patrol_vehicle"].includes(vehicle.type) ||
          (vehicle.type === "patrol_vehicle" && vehicle.agency !== agent.agency),
      ),
    ).toEqual([]);
  });

  it("is deterministic for the same seed", () => {
    const first = listEquipment(seeded(7).db).map((item) => [item.serialNumber, item.status]);
    const second = listEquipment(seeded(7).db).map((item) => [item.serialNumber, item.status]);
    expect(first).toEqual(second);
  });
});
