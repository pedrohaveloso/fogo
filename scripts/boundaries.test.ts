import { describe, expect, it } from "vitest";
import type { LngLat } from "../src/shared/geo.ts";
import {
  cellCenter,
  cellOf,
  createGrid,
  dilate,
  fillHoles,
  fillUnowned,
  growOwners,
  keepMainComponents,
  nameKey,
  networkOwners,
  outerRing,
  rasterizeLines,
  ringsFromWays,
  simplifyRing,
  type Grid,
} from "./boundaries.ts";

function squareGrid(size: number): Grid {
  return { west: 0, south: 0, cellLng: 1, cellLat: 1, cols: size, rows: size };
}

function fromRows(rows: string[]): { grid: Grid; mask: Uint8Array } {
  const grid: Grid = {
    west: 0,
    south: 0,
    cellLng: 1,
    cellLat: 1,
    cols: rows[0]!.length,
    rows: rows.length,
  };
  const mask = new Uint8Array(grid.cols * grid.rows);
  rows.forEach((line, row) => {
    [...line].forEach((char, col) => {
      mask[row * grid.cols + col] = char === "#" ? 1 : 0;
    });
  });
  return { grid, mask };
}

describe("grid", () => {
  it("maps points to cells and back, and rejects points outside", () => {
    const grid = createGrid({ west: -50, south: -22.3, east: -49.9, north: -22.2 }, 100);
    const cell = cellOf(grid, [-49.95, -22.25]);
    expect(cell).toBeGreaterThanOrEqual(0);
    const [lng, lat] = cellCenter(grid, cell);
    expect(Math.abs(lng + 49.95)).toBeLessThan(grid.cellLng);
    expect(Math.abs(lat + 22.25)).toBeLessThan(grid.cellLat);
    expect(cellOf(grid, [-51, -22.25])).toBe(-1);
    expect(cellOf(grid, [-49.95, -22])).toBe(-1);
  });
});

describe("rasterizeLines", () => {
  it("draws a diagonal line that a four-way walk cannot cross", () => {
    const grid = squareGrid(10);
    const barrier = rasterizeLines(grid, [
      [
        [0, 0],
        [10, 10],
      ],
    ]);
    const inside = new Uint8Array(100).fill(1);
    const owner = growOwners(grid, new Map([[90, 0]]), inside, barrier);
    expect(owner[9]).toBe(-1);
    expect(owner[90]).toBe(0);
  });
});

describe("fillHoles and dilate", () => {
  it("fills enclosed gaps but keeps the outside open", () => {
    const { grid, mask } = fromRows([".....", ".###.", ".#.#.", ".###.", "....."]);
    const filled = fillHoles(grid, mask);
    expect(filled[12]).toBe(1);
    expect(filled[0]).toBe(0);
  });

  it("grows a single cell into a disk", () => {
    const grid = squareGrid(5);
    const mask = new Uint8Array(25);
    mask[12] = 1;
    const grown = dilate(grid, mask, 1);
    expect([7, 11, 12, 13, 17].every((cell) => grown[cell] === 1)).toBe(true);
    expect(grown[6]).toBe(0);
  });
});

describe("growOwners", () => {
  it("keeps a river between two neighborhoods", () => {
    const { grid, mask: barrier } = fromRows(["..#..", "..#..", "..#..", "..#..", "..#.."]);
    const inside = new Uint8Array(25).fill(1);
    const owner = growOwners(
      grid,
      new Map([
        [0, 0],
        [4, 1],
      ]),
      inside,
      barrier,
    );
    expect(owner[20]).toBe(0);
    expect(owner[24]).toBe(1);
    expect(owner[2]).toBe(-1);
    fillUnowned(grid, owner, inside);
    expect([...owner].every((value) => value >= 0)).toBe(true);
  });

  it("leaves cells outside the urban area unowned", () => {
    const grid = squareGrid(3);
    const inside = new Uint8Array([1, 1, 0, 1, 1, 0, 0, 0, 0]);
    const owner = growOwners(grid, new Map([[0, 0]]), inside, new Uint8Array(9));
    expect(owner[2]).toBe(-1);
    expect(owner[4]).toBe(0);
  });
});

describe("keepMainComponents", () => {
  it("hands detached fragments to the surrounding neighborhood", () => {
    const grid = squareGrid(5);
    const owner = new Int32Array(25).fill(1);
    owner[0] = 0;
    owner[1] = 0;
    owner[18] = 0;
    keepMainComponents(grid, owner, [0, 12]);
    expect(owner[0]).toBe(0);
    expect(owner[18]).toBe(1);
  });
});

describe("outerRing", () => {
  it("traces the outline of an L-shaped region counterclockwise", () => {
    const { grid, mask } = fromRows(["##.", "#..", "..."]);
    const ring = outerRing(grid, (cell) => mask[cell] === 1);
    expect(ring).toHaveLength(8);
    const area = ring.reduce((sum, [x1, y1], index) => {
      const [x2, y2] = ring[(index + 1) % ring.length]!;
      return sum + x1 * y2 - x2 * y1;
    }, 0);
    expect(area / 2).toBe(3);
  });

  it("returns an empty ring for an empty region", () => {
    expect(outerRing(squareGrid(3), () => false)).toEqual([]);
  });
});

describe("simplifyRing", () => {
  it("drops points that lie on a straight edge", () => {
    const ring: LngLat[] = [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
      [0.002, 0.002],
      [0, 0.002],
    ];
    expect(simplifyRing(ring, 1)).toHaveLength(4);
  });
});

describe("ringsFromWays", () => {
  it("joins ways in any direction into closed rings and drops open ones", () => {
    const rings = ringsFromWays([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ],
      [
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });
});

describe("networkOwners", () => {
  it("gives each node to the source closest along the roads", () => {
    const nodes: LngLat[] = [
      [0, 0],
      [0.01, 0],
      [0.02, 0],
      [0.03, 0],
      [0.1, 0],
    ];
    const { owner, distance } = networkOwners(
      nodes,
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      [0, 3],
    );
    expect([...owner]).toEqual([0, 0, 1, 1, -1]);
    expect(distance[4]).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("nameKey", () => {
  it("matches names regardless of accents and generic prefixes", () => {
    expect(nameKey("Jardim Julieta")).toBe(nameKey("Julieta"));
    expect(nameKey("Núcleo Habitacional Padre Nóbrega")).toBe("padre nobrega");
    expect(nameKey("Lácio")).toBe("lacio");
  });
});
