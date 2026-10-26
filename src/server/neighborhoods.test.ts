import { describe, expect, it } from "vitest";
import type { LngLat } from "../shared/geo.ts";
import type { CityDataset } from "../shared/types.ts";
import { city } from "./city.ts";
import { openDatabase } from "./db.ts";
import { createNeighborhoodShapes } from "./neighborhoods.ts";
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
