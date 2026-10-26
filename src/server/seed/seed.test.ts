import { describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES } from "../../shared/catalog.ts";
import { pointInPolygon, type LngLat } from "../../shared/geo.ts";
import { addDays } from "../../shared/time.ts";
import { getSetting } from "../db.ts";
import { listAgents } from "../repositories/agents.ts";
import { listEquipment } from "../repositories/equipment.ts";
import { NOW } from "../test-fixtures.ts";
import { createRandom } from "../random.ts";
import { mariliaCity, seededDatabase } from "../test-database.ts";
import { createInventory } from "./inventory.ts";
import { isDatabaseEmpty } from "./index.ts";

async function seeded() {
  const { db, city } = await seededDatabase();
  const summary = {
    equipment: (await listEquipment(db, city.city.id)).length,
    occurrences: (
      (await db.one("SELECT COUNT(*) AS total FROM occurrences", [])) as { total: number }
    ).total,
  };
  return { db, summary, city, cityId: city.city.id };
}

describe("seedDatabase", () => {
  it("creates a consistent inventory placed in known neighborhoods", async () => {
    const { db, summary, city, cityId } = await seeded();
    expect(await isDatabaseEmpty(db)).toBe(false);
    expect(summary.equipment).toBeGreaterThan(250);
    expect(summary.occurrences).toBeGreaterThan(1000);
    const neighborhoods = new Set(city.neighborhoods.map((item) => item.id));
    const items = await listEquipment(db, cityId);
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
    expect(await getSetting(db, "seeded_at")).toBe(String(NOW));
    expect(city.city).toMatchObject({ name: "Marília", uf: "SP", simulated: true });
    expect(city.agencies).toHaveLength(4);
  });

  it("puts every equipment and agent base inside its own neighborhood polygon", async () => {
    const { db, city, cityId } = await seeded();
    const byId = new Map(city.neighborhoods.map((item) => [item.id, item]));
    const misplacedEquipment = (await listEquipment(db, cityId)).filter((item) => {
      const point: LngLat = [item.lng, item.lat];
      const inOwn = pointInPolygon(point, byId.get(item.neighborhoodId)!.polygon);
      return !inOwn && city.neighborhoods.some((other) => pointInPolygon(point, other.polygon));
    });
    expect(misplacedEquipment.map((item) => item.serialNumber)).toEqual([]);
    const misplacedAgents = (await listAgents(db, cityId)).filter(
      (agent) =>
        !pointInPolygon([agent.lng, agent.lat], byId.get(agent.baseNeighborhoodId)!.polygon),
    );
    expect(misplacedAgents.map((agent) => agent.name)).toEqual([]);
    const occurrences = (await db.query(
      "SELECT neighborhood_id AS id, lat, lng FROM occurrences",
      [],
    )) as { id: string; lat: number; lng: number }[];
    const outside = occurrences.filter(
      (item) => !pointInPolygon([item.lng, item.lat], byId.get(item.id)!.polygon),
    );
    expect(outside).toEqual([]);
  });

  it("links vehicles to at most one agent of the right agency", async () => {
    const { db, cityId } = await seeded();
    const equipment = new Map((await listEquipment(db, cityId)).map((item) => [item.id, item]));
    const vehicles = (await listAgents(db, cityId))
      .filter((agent) => agent.vehicleId !== null)
      .map((agent) => ({ agent, vehicle: equipment.get(agent.vehicleId!)! }));
    expect(new Set(vehicles.map((item) => item.vehicle.id)).size).toBe(vehicles.length);
    expect(
      vehicles.filter(
        ({ agent, vehicle }) =>
          !["agent_motorcycle", "patrol_vehicle"].includes(vehicle.type) ||
          (vehicle.type === "patrol_vehicle" && vehicle.agencyId !== agent.agencyId),
      ),
    ).toEqual([]);
  });

  it("is deterministic for the same seed", () => {
    const city = mariliaCity();
    const serials = (seed: number) =>
      createInventory(city, createRandom(seed)).map((item) => [item.serialNumber, item.lat]);
    expect(serials(7)).toEqual(serials(7));
    expect(serials(7)).not.toEqual(serials(8));
  });
});
