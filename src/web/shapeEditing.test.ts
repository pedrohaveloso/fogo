import { describe, expect, it } from "vitest";
import type { LngLat } from "../shared/geo.ts";
import {
  insertVertex,
  midpoints,
  moveVertex,
  removeVertex,
  sameShape,
  shapeProblem,
} from "./shapeEditing.ts";

const square: LngLat[] = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
];

describe("shape editing", () => {
  it("moves one vertex and leaves the original untouched", () => {
    const moved = moveVertex(square, 2, [3, 3]);
    expect(moved[2]).toEqual([3, 3]);
    expect(square[2]).toEqual([2, 2]);
  });

  it("inserts a vertex after the edge it splits, including the closing edge", () => {
    expect(insertVertex(square, 0, [1, 0])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
    expect(insertVertex(square, 3, [0, 1]).at(-1)).toEqual([0, 1]);
  });

  it("removes vertices but never below a triangle", () => {
    const triangle = removeVertex(square, 1);
    expect(triangle).toEqual([
      [0, 0],
      [2, 2],
      [0, 2],
    ]);
    expect(removeVertex(triangle, 0)).toEqual(triangle);
  });

  it("puts a midpoint on every edge, closing edge included", () => {
    expect(midpoints(square)).toEqual([
      [1, 0],
      [2, 1],
      [1, 2],
      [0, 1],
    ]);
    expect(midpoints([[0, 0]])).toEqual([]);
  });

  it("explains why a shape cannot be saved", () => {
    expect(shapeProblem(square)).toBeNull();
    expect(shapeProblem(square.slice(0, 2))).toBe("Marque ao menos 3 pontos para fechar o bairro.");
    expect(
      shapeProblem([
        [0, 0],
        [2, 2],
        [2, 0],
        [0, 2],
      ]),
    ).toBe("As linhas do bairro estão se cruzando.");
  });

  it("compares shapes point by point", () => {
    expect(sameShape(square, [...square])).toBe(true);
    expect(sameShape(square, moveVertex(square, 0, [0, 1]))).toBe(false);
    expect(sameShape(square, square.slice(1))).toBe(false);
  });
});
