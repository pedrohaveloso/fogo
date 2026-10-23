import { describe, expect, it } from "vitest";
import { centroid, pointInPolygon } from "../shared/geo.ts";
import { city, nearestNeighborhood } from "./city.ts";

describe("city dataset", () => {
  it("gives every neighborhood its own polygon", () => {
    const missing = city.neighborhoods.filter((item) => item.polygon.length < 3);
    expect(missing.map((item) => item.name)).toEqual([]);
  });

  it("places most neighborhood centers inside their own polygon", () => {
    const inside = city.neighborhoods.filter((item) =>
      pointInPolygon([item.lng, item.lat], item.polygon),
    );
    expect(inside.length / city.neighborhoods.length).toBeGreaterThan(0.9);
  });
});

describe("nearestNeighborhood", () => {
  it("returns the neighborhood whose polygon contains the point", () => {
    const target = city.neighborhoods.find((item) => item.polygon.length > 3)!;
    const point = centroid(target.polygon);
    const found = nearestNeighborhood(point);
    expect(pointInPolygon(point, found.polygon)).toBe(true);
  });

  it("falls back to the closest center outside every polygon", () => {
    const southernmost = city.neighborhoods.reduce((best, item) =>
      item.lat < best.lat ? item : best,
    );
    expect(nearestNeighborhood([southernmost.lng, -23.5]).id).toBe(southernmost.id);
  });
});
