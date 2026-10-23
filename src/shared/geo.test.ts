import { describe, expect, it } from "vitest";
import { convexHull, distanceKm, moveTowards, pointInPolygon, type LngLat } from "./geo.ts";

const square: LngLat[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm([-49.9, -22.2], [-49.9, -22.2])).toBe(0);
  });

  it("matches the known length of one degree of latitude", () => {
    expect(distanceKm([0, 0], [0, 1])).toBeCloseTo(111.19, 1);
  });
});

describe("convexHull", () => {
  it("drops interior points", () => {
    const hull = convexHull([...square, [0.5, 0.5], [0.2, 0.7]]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([0.5, 0.5]);
  });

  it("returns fewer than three points unchanged", () => {
    expect(convexHull([[1, 1]])).toEqual([[1, 1]]);
    expect(convexHull([])).toEqual([]);
  });
});

describe("pointInPolygon", () => {
  it("detects inside and outside points", () => {
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], square)).toBe(false);
  });
});

describe("moveTowards", () => {
  it("stops at the destination instead of overshooting", () => {
    expect(moveTowards([0, 0], [0, 0.001], 5)).toEqual([0, 0.001]);
  });

  it("advances by the requested distance", () => {
    const next = moveTowards([0, 0], [0, 1], 11.119);
    expect(distanceKm([0, 0], next)).toBeCloseTo(11.119, 2);
  });
});
