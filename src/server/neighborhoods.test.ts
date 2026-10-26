import { describe, expect, it } from "vitest";
import type { LngLat } from "../shared/geo.ts";
import type { CityDataset } from "../shared/types.ts";
import { city } from "./city.ts";
import { openDatabase } from "./db.ts";
import {
  NeighborhoodInUseError,
  NeighborhoodNameTakenError,
  createNeighborhoodShapes,
  slugFor,
} from "./neighborhoods.ts";
import { NOW } from "./test-fixtures.ts";

const triangle: LngLat[] = [
  [-49.95, -22.21],
  [-49.94, -22.21],
  [-49.945, -22.2],
];

function freshCity(): CityDataset {
  return structuredClone(city);
}

describe("neighborhood shapes", () => {
  it("stores the generated shapes on first load", () => {
    const db = openDatabase(":memory:");
    createNeighborhoodShapes(db, freshCity()).load(NOW);
    const { total } = db.prepare("SELECT COUNT(*) AS total FROM neighborhood_shapes").get() as {
      total: number;
    };
    expect(total).toBe(city.neighborhoods.length);
  });

  it("brings an edited shape back after a restart", () => {
    const db = openDatabase(":memory:");
    createNeighborhoodShapes(db, freshCity()).load(NOW);
    createNeighborhoodShapes(db, freshCity()).save("centro", triangle, NOW + 1000);

    const restarted = freshCity();
    const shapes = createNeighborhoodShapes(db, restarted);
    shapes.load(NOW + 2000);
    expect(restarted.neighborhoods.find((item) => item.id === "centro")!.polygon).toEqual(triangle);
    expect(shapes.list().find((item) => item.id === "centro")).toMatchObject({
      edited: true,
      updatedAt: new Date(NOW + 1000).toISOString(),
    });
  });

  it("keeps the anchor when it still falls inside and moves it otherwise", () => {
    const db = openDatabase(":memory:");
    const target = freshCity();
    const shapes = createNeighborhoodShapes(db, target);
    shapes.load(NOW);
    const centro = target.neighborhoods.find((item) => item.id === "centro")!;
    const around: LngLat[] = [
      [centro.lng - 0.01, centro.lat - 0.01],
      [centro.lng + 0.01, centro.lat - 0.01],
      [centro.lng + 0.01, centro.lat + 0.01],
      [centro.lng - 0.01, centro.lat + 0.01],
    ];
    const anchor = { lat: centro.lat, lng: centro.lng };
    expect(shapes.save("centro", around, NOW)).toMatchObject(anchor);
    const moved = shapes.save("centro", triangle, NOW)!;
    expect(moved.lng).toBeCloseTo(-49.945, 3);
    expect(moved.lat).toBeCloseTo(-22.2067, 3);
  });

  it("restores the generated shape and ignores unknown neighborhoods", () => {
    const db = openDatabase(":memory:");
    const target = freshCity();
    const original = structuredClone(target.neighborhoods.find((item) => item.id === "centro")!);
    const shapes = createNeighborhoodShapes(db, target);
    shapes.load(NOW);
    shapes.save("centro", triangle, NOW);
    expect(shapes.reset("centro", NOW)).toMatchObject({
      polygon: original.polygon,
      lat: original.lat,
      lng: original.lng,
      edited: false,
    });
    expect(shapes.save("nada", triangle, NOW)).toBeNull();
    expect(shapes.reset("nada", NOW)).toBeNull();
  });
});

describe("custom neighborhoods", () => {
  it("brings a new neighborhood back after a restart", () => {
    const db = openDatabase(":memory:");
    const first = freshCity();
    const shapes = createNeighborhoodShapes(db, first);
    shapes.load(NOW);
    const created = shapes.create({ name: "Vila Nova", regionId: "north", polygon: triangle }, NOW);
    expect(created).toMatchObject({ id: "vila-nova", custom: true, polygon: triangle });
    expect(first.neighborhoods.at(-1)!.id).toBe("vila-nova");

    const restarted = freshCity();
    const reloaded = createNeighborhoodShapes(db, restarted);
    reloaded.load(NOW + 1000);
    const back = restarted.neighborhoods.find((item) => item.id === "vila-nova")!;
    expect(back).toMatchObject({ name: "Vila Nova", regionId: "north", polygon: triangle });
    expect(reloaded.list().find((item) => item.id === "vila-nova")).toMatchObject({
      custom: true,
      edited: false,
    });
    expect(reloaded.reset("vila-nova", NOW)).toBeNull();
    expect(reloaded.save("vila-nova", triangle, NOW)!.edited).toBe(false);
  });

  it("refuses a repeated name, ignoring accents and case", () => {
    const shapes = createNeighborhoodShapes(openDatabase(":memory:"), freshCity());
    shapes.load(NOW);
    expect(() =>
      shapes.create({ name: "CENTRO", regionId: "center", polygon: triangle }, NOW),
    ).toThrow(NeighborhoodNameTakenError);
  });

  it("removes only unused custom neighborhoods", () => {
    const db = openDatabase(":memory:");
    const target = freshCity();
    const shapes = createNeighborhoodShapes(db, target);
    shapes.load(NOW);
    shapes.create({ name: "Vila Nova", regionId: "north", polygon: triangle }, NOW);
    db.prepare(
      `INSERT INTO occurrences (kind, severity, status, source, neighborhood_id, lat, lng, description, created_at)
       VALUES ('accident', 2, 'open', 'manual', 'vila-nova', 0, 0, '', ?)`,
    ).run(NOW);
    expect(() => shapes.remove("vila-nova")).toThrow(NeighborhoodInUseError);
    db.prepare("DELETE FROM occurrences").run();
    expect(shapes.remove("vila-nova")).toBe(true);
    expect(target.neighborhoods.some((item) => item.id === "vila-nova")).toBe(false);
    expect(shapes.remove("centro")).toBe(false);
    expect(shapes.remove("nada")).toBe(false);
  });
});

describe("slugFor", () => {
  it("builds an id from the name and skips ids in use", () => {
    expect(slugFor("Jardim São Gabriel", () => false)).toBe("jardim-sao-gabriel");
    const taken = new Set(["vila", "vila-2"]);
    expect(slugFor("Vila!", (id) => taken.has(id))).toBe("vila-3");
    expect(slugFor("***", () => false)).toBe("bairro");
  });
});
