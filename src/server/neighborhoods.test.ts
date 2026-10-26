import { describe, expect, it } from "vitest";
import type { LngLat } from "../shared/geo.ts";
import { insertCity, loadCity } from "./city.ts";
import {
  NeighborhoodInUseError,
  NeighborhoodNameTakenError,
  RegionInUseError,
  RegionNameTakenError,
  createNeighborhoodShapes,
  slugFor,
} from "./neighborhoods.ts";
import { NOW } from "./test-fixtures.ts";
import { cityDatabase } from "./test-database.ts";

const triangle: LngLat[] = [
  [-49.95, -22.21],
  [-49.94, -22.21],
  [-49.945, -22.2],
];

async function setup() {
  const { db, city } = await cityDatabase();
  return { db, city, shapes: createNeighborhoodShapes(db, city) };
}

describe("neighborhood shapes", () => {
  it("keeps an edited shape in the database", async () => {
    const { db, city, shapes } = await setup();
    await shapes.save("centro", triangle, NOW + 1000);
    expect(city.neighborhoods.find((item) => item.id === "centro")!.polygon).toEqual(triangle);
    const restarted = (await loadCity(db, city.city.id))!;
    expect(restarted.neighborhoods.find((item) => item.id === "centro")!.polygon).toEqual(triangle);
    expect(
      (await createNeighborhoodShapes(db, restarted).list()).find((item) => item.id === "centro"),
    ).toMatchObject({ edited: true, custom: false, updatedAt: new Date(NOW + 1000).toISOString() });
  });

  it("keeps the anchor when it still falls inside and moves it otherwise", async () => {
    const { city, shapes } = await setup();
    const centro = city.neighborhoods.find((item) => item.id === "centro")!;
    const around: LngLat[] = [
      [centro.lng - 0.01, centro.lat - 0.01],
      [centro.lng + 0.01, centro.lat - 0.01],
      [centro.lng + 0.01, centro.lat + 0.01],
      [centro.lng - 0.01, centro.lat + 0.01],
    ];
    const anchor = { lat: centro.lat, lng: centro.lng };
    expect(await shapes.save("centro", around, NOW)).toMatchObject(anchor);
    const moved = (await shapes.save("centro", triangle, NOW))!;
    expect(moved.lng).toBeCloseTo(-49.945, 3);
    expect(moved.lat).toBeCloseTo(-22.2067, 3);
  });

  it("restores the imported shape and ignores unknown neighborhoods", async () => {
    const { city, shapes } = await setup();
    const original = structuredClone(city.neighborhoods.find((item) => item.id === "centro")!);
    await shapes.save("centro", triangle, NOW);
    expect(await shapes.reset("centro", NOW)).toMatchObject({
      polygon: original.polygon,
      lat: original.lat,
      lng: original.lng,
      edited: false,
    });
    expect(await shapes.save("nada", triangle, NOW)).toBeNull();
    expect(await shapes.reset("nada", NOW)).toBeNull();
  });
});

describe("drawn neighborhoods", () => {
  it("creates one without an imported shape to go back to", async () => {
    const { db, city, shapes } = await setup();
    const created = await shapes.create(
      { name: "Vila Nova", regionId: "north", polygon: triangle },
      NOW,
    );
    expect(created).toMatchObject({ id: "vila-nova", custom: true, polygon: triangle });
    expect(city.neighborhoods.some((item) => item.id === "vila-nova")).toBe(true);
    const reloaded = createNeighborhoodShapes(db, (await loadCity(db, city.city.id))!);
    expect((await reloaded.list()).find((item) => item.id === "vila-nova")).toMatchObject({
      name: "Vila Nova",
      regionId: "north",
      custom: true,
      edited: false,
    });
    expect(await reloaded.reset("vila-nova", NOW)).toBeNull();
    expect((await reloaded.save("vila-nova", triangle, NOW))!.edited).toBe(false);
  });

  it("refuses a repeated name, ignoring accents and case", async () => {
    const { shapes } = await setup();
    await expect(
      shapes.create({ name: "CENTRO", regionId: "center", polygon: triangle }, NOW),
    ).rejects.toThrow(NeighborhoodNameTakenError);
  });

  it("gives the same name in another city its own id", async () => {
    const { db, shapes } = await setup();
    const otherId = await insertCity(
      db,
      {
        name: "Garça",
        uf: "SP",
        ibgeCode: 3516705,
        center: [-49.65, -22.21],
        boundary: triangle,
        simulated: false,
      },
      NOW,
    );
    const other = createNeighborhoodShapes(db, (await loadCity(db, otherId))!);
    const region = await other.createRegion("Centro", NOW);
    expect(region.id).toBe("centro");
    const created = await other.create(
      { name: "Centro", regionId: region.id, polygon: triangle },
      NOW,
    );
    expect(created.id).toBe("centro-2");
    expect((await shapes.list()).filter((item) => item.name === "Centro")).toHaveLength(1);
  });

  it("renames and moves a neighborhood to another zone", async () => {
    const { city, shapes } = await setup();
    expect(
      await shapes.update("centro", { name: "Centro Histórico", regionId: "north" }, NOW),
    ).toMatchObject({ name: "Centro Histórico", regionId: "north" });
    expect(city.neighborhoods.find((item) => item.id === "centro")!.name).toBe("Centro Histórico");
    await expect(
      shapes.update("centro", { name: "Fragata", regionId: "north" }, NOW),
    ).rejects.toThrow(NeighborhoodNameTakenError);
    expect(await shapes.update("nada", { name: "Nada", regionId: "north" }, NOW)).toBeNull();
  });

  it("removes only unused neighborhoods", async () => {
    const { db, city, shapes } = await setup();
    await shapes.create({ name: "Vila Nova", regionId: "north", polygon: triangle }, NOW);
    await db.run(
      `INSERT INTO occurrences (city_id, kind, severity, status, source, neighborhood_id, lat, lng, description, created_at)
       VALUES ($1, 'accident', 2, 'open', 'manual', 'vila-nova', 0, 0, '', $2)`,
      [city.city.id, NOW],
    );
    await expect(shapes.remove("vila-nova")).rejects.toThrow(NeighborhoodInUseError);
    await db.run("DELETE FROM occurrences", []);
    expect(await shapes.remove("vila-nova")).toBe(true);
    expect(city.neighborhoods.some((item) => item.id === "vila-nova")).toBe(false);
    expect(await shapes.remove("nada")).toBe(false);
  });
});

describe("zones", () => {
  it("creates, renames and removes an empty zone", async () => {
    const { city, shapes } = await setup();
    const zone = await shapes.createRegion("Zona Rural", NOW);
    expect(zone).toEqual({ id: "zona-rural", name: "Zona Rural" });
    expect(city.regions.some((item) => item.id === "zona-rural")).toBe(true);
    expect(await shapes.renameRegion("zona-rural", "Área Rural")).toEqual({
      id: "zona-rural",
      name: "Área Rural",
    });
    expect(await shapes.removeRegion("zona-rural")).toBe(true);
    expect(await shapes.removeRegion("zona-rural")).toBe(false);
    expect(await shapes.renameRegion("zona-rural", "Nada")).toBeNull();
  });

  it("refuses repeated names and zones that still have neighborhoods", async () => {
    const { shapes } = await setup();
    await expect(shapes.createRegion("zona norte", NOW)).rejects.toThrow(RegionNameTakenError);
    await expect(shapes.renameRegion("north", "Centro")).rejects.toThrow(RegionNameTakenError);
    await expect(shapes.removeRegion("north")).rejects.toThrow(RegionInUseError);
  });
});

describe("slugFor", () => {
  it("builds an id from the name and skips ids in use", async () => {
    expect(slugFor("Jardim São Gabriel", "bairro", () => false)).toBe("jardim-sao-gabriel");
    const taken = new Set(["vila", "vila-2"]);
    expect(slugFor("Vila!", "bairro", (id) => taken.has(id))).toBe("vila-3");
    expect(slugFor("***", "zona", () => false)).toBe("zona");
  });
});
