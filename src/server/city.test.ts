import { describe, expect, it } from "vitest";
import { centroid, pointInPolygon } from "../shared/geo.ts";
import { landmarksOf, loadCity, nearestNeighborhood, streetPlacesOf } from "./city.ts";
import { mariliaCity, seededDatabase } from "./test-database.ts";

const city = mariliaCity();

describe("city dataset", () => {
  it("gives every neighborhood its own polygon", async () => {
    const missing = city.neighborhoods.filter((item) => item.polygon.length < 3);
    expect(missing.map((item) => item.name)).toEqual([]);
  });

  it("places most neighborhood centers inside their own polygon", async () => {
    const inside = city.neighborhoods.filter((item) =>
      pointInPolygon([item.lng, item.lat], item.polygon),
    );
    expect(inside.length / city.neighborhoods.length).toBeGreaterThan(0.9);
  });
});

describe("nearestNeighborhood", () => {
  it("returns the neighborhood whose polygon contains the point", async () => {
    const target = city.neighborhoods.find((item) => item.polygon.length > 3)!;
    const point = centroid(target.polygon);
    const found = nearestNeighborhood(city, point)!;
    expect(pointInPolygon(point, found.polygon)).toBe(true);
  });

  it("falls back to the closest center outside every polygon", async () => {
    const southernmost = city.neighborhoods.reduce((best, item) =>
      item.lat < best.lat ? item : best,
    );
    expect(nearestNeighborhood(city, [southernmost.lng, -23.5])?.id).toBe(southernmost.id);
  });

  it("finds nothing in a city without neighborhoods", async () => {
    expect(nearestNeighborhood({ ...city, neighborhoods: [] }, [-49.9, -22.2])).toBeUndefined();
  });
});

describe("loadCity", () => {
  it("reads back what the seed stored, sorted by name", async () => {
    const { db, city: loaded } = await seededDatabase();
    expect(loaded.city).toMatchObject({ name: "Marília", uf: "SP", simulated: true });
    expect(loaded.neighborhoods).toHaveLength(city.neighborhoods.length);
    expect(loaded.agencies.map((item) => item.name)).toEqual(
      loaded.agencies.map((item) => item.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
    expect(await loadCity(db, 999)).toBeNull();
  });
});

describe("landmarksOf", () => {
  it("keeps only places people use to find their way", async () => {
    const landmarks = landmarksOf({
      ...city,
      pois: [
        { name: "Santa Casa", kind: "hospital", lat: 1, lng: 2, neighborhoodId: "centro" },
        { name: "Posto", kind: "fuel", lat: 1, lng: 2, neighborhoodId: "centro" },
      ],
    });
    expect(landmarks).toEqual([{ name: "Santa Casa", kind: "hospital", lat: 1, lng: 2 }]);
  });
});

describe("streetPlacesOf", () => {
  it("keeps one point per street and neighborhood", async () => {
    const street = { kind: "residential", lat: 1, lng: 2, cep: "17500-000" };
    const places = streetPlacesOf({
      ...city,
      streets: [
        { ...street, name: "Rua A", neighborhoodId: "centro" },
        { ...street, name: "Rua A", neighborhoodId: "centro", lat: 5 },
        { ...street, name: "Rua A", neighborhoodId: "fragata" },
      ],
    });
    expect(places).toEqual([
      { name: "Rua A", lat: 1, lng: 2, neighborhoodId: "centro" },
      { name: "Rua A", lat: 1, lng: 2, neighborhoodId: "fragata" },
    ]);
  });
});
