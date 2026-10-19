import { describe, expect, it } from "vitest";
import { labelPositions, niceTicks } from "./scale.ts";

describe("niceTicks", () => {
  it("steps by round numbers across the range", () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(80, 100)).toEqual([80, 85, 90, 95, 100]);
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6]);
  });

  it("returns the single value of a flat range", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe("labelPositions", () => {
  it("keeps labels apart on narrow charts and always labels the last point", () => {
    expect(labelPositions(120, 560, 70)).toEqual([0, 17, 34, 51, 68, 85, 102, 119]);
    expect(labelPositions(90, 600, 70)).toEqual([0, 13, 26, 39, 52, 65, 78, 89]);
    expect(labelPositions(120, 200, 70)).toEqual([0, 119]);
  });

  it("labels every point when there is room", () => {
    expect(labelPositions(5, 600, 70)).toEqual([0, 1, 2, 3, 4]);
  });

  it("drops the stride label that would collide with the last one", () => {
    expect(labelPositions(11, 300, 70)).toEqual([0, 4, 10]);
  });

  it("handles empty and single-point series", () => {
    expect(labelPositions(0, 600, 70)).toEqual([]);
    expect(labelPositions(1, 600, 70)).toEqual([0]);
  });
});
