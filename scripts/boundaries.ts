import type { LngLat } from "../src/shared/geo.ts";

const METERS_PER_DEGREE = 111_320;

export type Grid = {
  west: number;
  south: number;
  cellLng: number;
  cellLat: number;
  cols: number;
  rows: number;
};

export type Bounds = { west: number; south: number; east: number; north: number };

export function createGrid(bounds: Bounds, cellMeters: number): Grid {
  const latitude = (bounds.south + bounds.north) / 2;
  const cellLat = cellMeters / METERS_PER_DEGREE;
  const cellLng = cellMeters / (METERS_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
  return {
    west: bounds.west,
    south: bounds.south,
    cellLng,
    cellLat,
    cols: Math.ceil((bounds.east - bounds.west) / cellLng),
    rows: Math.ceil((bounds.north - bounds.south) / cellLat),
  };
}

export function cellOf(grid: Grid, [lng, lat]: LngLat): number {
  const col = Math.floor((lng - grid.west) / grid.cellLng);
  const row = Math.floor((lat - grid.south) / grid.cellLat);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) {
    return -1;
  }
  return row * grid.cols + col;
}

export function cellCenter(grid: Grid, index: number): LngLat {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return [grid.west + (col + 0.5) * grid.cellLng, grid.south + (row + 0.5) * grid.cellLat];
}

function neighbors4(grid: Grid, index: number): number[] {
  const col = index % grid.cols;
  const result: number[] = [];
  if (col > 0) {
    result.push(index - 1);
  }
  if (col < grid.cols - 1) {
    result.push(index + 1);
  }
  if (index >= grid.cols) {
    result.push(index - grid.cols);
  }
  if (index < grid.cols * (grid.rows - 1)) {
    result.push(index + grid.cols);
  }
  return result;
}

function samples(grid: Grid, from: LngLat, to: LngLat): LngLat[] {
  const steps = Math.max(
    1,
    Math.ceil(
      Math.max(Math.abs(to[0] - from[0]) / grid.cellLng, Math.abs(to[1] - from[1]) / grid.cellLat) *
        2,
    ),
  );
  return Array.from({ length: steps + 1 }, (_, step): LngLat => {
    const ratio = step / steps;
    return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
  });
}

export function rasterizeLines(grid: Grid, lines: readonly LngLat[][]): Uint8Array {
  const marked = new Uint8Array(grid.cols * grid.rows);
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      for (const point of samples(grid, line[index - 1]!, line[index]!)) {
        const cell = cellOf(grid, point);
        if (cell >= 0) {
          marked[cell] = 1;
        }
      }
    }
  }
  return marked;
}

export function dilate(grid: Grid, mask: Uint8Array, radiusCells: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
      for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
        const x = col + dx;
        const y = row + dy;
        if (dx * dx + dy * dy <= radiusCells * radiusCells && x >= 0 && y >= 0) {
          if (x < grid.cols && y < grid.rows) {
            result[y * grid.cols + x] = 1;
          }
        }
      }
    }
  }
  return result;
}

export function fillHoles(grid: Grid, mask: Uint8Array): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);
    const border = col === 0 || row === 0 || col === grid.cols - 1 || row === grid.rows - 1;
    if (border && !mask[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighbors4(grid, queue[head]!)) {
      if (!mask[next] && !outside[next]) {
        outside[next] = 1;
        queue.push(next);
      }
    }
  }
  return outside.map((value) => (value ? 0 : 1));
}

export function growOwners(
  grid: Grid,
  seeds: ReadonlyMap<number, number>,
  inside: Uint8Array,
  barrier: Uint8Array,
): Int32Array {
  const owner = new Int32Array(inside.length).fill(-1);
  const queue: number[] = [];
  for (const [cell, seedOwner] of seeds) {
    if (inside[cell]) {
      owner[cell] = seedOwner;
      queue.push(cell);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head]!;
    for (const next of neighbors4(grid, cell)) {
      if (inside[next] && !barrier[next] && owner[next] === -1) {
        owner[next] = owner[cell]!;
        queue.push(next);
      }
    }
  }
  return owner;
}

function mostCommonNeighbor(grid: Grid, owner: Int32Array, cell: number): number {
  const counts = new Map<number, number>();
  for (const next of neighbors4(grid, cell)) {
    const value = owner[next]!;
    if (value >= 0 && value !== owner[cell]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  let best = -1;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function fillUnowned(grid: Grid, owner: Int32Array, inside: Uint8Array): void {
  for (let pass = 0; pass < grid.cols + grid.rows; pass += 1) {
    const pending: [number, number][] = [];
    for (let cell = 0; cell < owner.length; cell += 1) {
      if (inside[cell] && owner[cell] === -1) {
        const value = mostCommonNeighbor(grid, owner, cell);
        if (value >= 0) {
          pending.push([cell, value]);
        }
      }
    }
    if (pending.length === 0) {
      return;
    }
    for (const [cell, value] of pending) {
      owner[cell] = value;
    }
  }
}

function components(grid: Grid, owner: Int32Array, value: number): number[][] {
  const seen = new Uint8Array(owner.length);
  const result: number[][] = [];
  for (let start = 0; start < owner.length; start += 1) {
    if (owner[start] !== value || seen[start]) {
      continue;
    }
    seen[start] = 1;
    const component = [start];
    for (let head = 0; head < component.length; head += 1) {
      for (const next of neighbors4(grid, component[head]!)) {
        if (owner[next] === value && !seen[next]) {
          seen[next] = 1;
          component.push(next);
        }
      }
    }
    result.push(component);
  }
  return result;
}

export function keepMainComponents(
  grid: Grid,
  owner: Int32Array,
  anchors: readonly number[],
): void {
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (let value = 0; value < anchors.length; value += 1) {
      const parts = components(grid, owner, value);
      if (parts.length <= 1) {
        continue;
      }
      const anchored = parts.find((part) => part.includes(anchors[value]!));
      const main =
        anchored ?? parts.reduce((best, part) => (part.length > best.length ? part : best));
      for (const part of parts) {
        if (part === main) {
          continue;
        }
        for (const cell of part) {
          const next = mostCommonNeighbor(grid, owner, cell);
          if (next >= 0) {
            owner[cell] = next;
            changed = true;
          }
        }
      }
    }
    if (!changed) {
      return;
    }
  }
}

function signedArea(ring: readonly LngLat[]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[(index + 1) % ring.length]!;
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function outerRing(grid: Grid, isInside: (cell: number) => boolean): LngLat[] {
  const corner = (col: number, row: number) => row * (grid.cols + 1) + col;
  const next = new Map<number, number[]>();
  const link = (from: number, to: number) => {
    const list = next.get(from) ?? [];
    list.push(to);
    next.set(from, list);
  };
  for (let cell = 0; cell < grid.cols * grid.rows; cell += 1) {
    if (!isInside(cell)) {
      continue;
    }
    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    const outside = (x: number, y: number) =>
      x < 0 || y < 0 || x >= grid.cols || y >= grid.rows || !isInside(y * grid.cols + x);
    if (outside(col, row - 1)) {
      link(corner(col, row), corner(col + 1, row));
    }
    if (outside(col + 1, row)) {
      link(corner(col + 1, row), corner(col + 1, row + 1));
    }
    if (outside(col, row + 1)) {
      link(corner(col + 1, row + 1), corner(col, row + 1));
    }
    if (outside(col - 1, row)) {
      link(corner(col, row + 1), corner(col, row));
    }
  }
  let best: LngLat[] = [];
  let bestArea = 0;
  for (const start of next.keys()) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: number[] = [];
      let current = start;
      do {
        loop.push(current);
        const targets = next.get(current)!;
        current = targets.pop()!;
      } while (current !== start && (next.get(current)?.length ?? 0) > 0);
      const ring = loop.map((point): LngLat => {
        const col = point % (grid.cols + 1);
        const row = Math.floor(point / (grid.cols + 1));
        return [grid.west + col * grid.cellLng, grid.south + row * grid.cellLat];
      });
      const area = signedArea(ring);
      if (area > bestArea) {
        best = ring;
        bestArea = area;
      }
    }
  }
  return best;
}

function offsetMeters(point: LngLat, start: LngLat, end: LngLat): number {
  const scale = Math.cos((start[1] * Math.PI) / 180);
  const px = (point[0] - start[0]) * scale;
  const py = point[1] - start[1];
  const dx = (end[0] - start[0]) * scale;
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
  return Math.hypot(px - t * dx, py - t * dy) * METERS_PER_DEGREE;
}

function simplifyLine(points: LngLat[], toleranceMeters: number): LngLat[] {
  if (points.length <= 2) {
    return points;
  }
  let farthest = 0;
  let farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const offset = offsetMeters(points[index]!, points[0]!, points.at(-1)!);
    if (offset > farthest) {
      farthest = offset;
      farthestIndex = index;
    }
  }
  if (farthest <= toleranceMeters) {
    return [points[0]!, points.at(-1)!];
  }
  return [
    ...simplifyLine(points.slice(0, farthestIndex + 1), toleranceMeters).slice(0, -1),
    ...simplifyLine(points.slice(farthestIndex), toleranceMeters),
  ];
}

export function simplifyRing(ring: LngLat[], toleranceMeters: number): LngLat[] {
  if (ring.length < 4) {
    return ring;
  }
  const middle = Math.floor(ring.length / 2);
  const first = simplifyLine(ring.slice(0, middle + 1), toleranceMeters);
  const second = simplifyLine([...ring.slice(middle), ring[0]!], toleranceMeters);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

export function smoothRing(ring: LngLat[]): LngLat[] {
  return ring.flatMap((point, index): LngLat[] => {
    const next = ring[(index + 1) % ring.length]!;
    return [
      [point[0] * 0.75 + next[0] * 0.25, point[1] * 0.75 + next[1] * 0.25],
      [point[0] * 0.25 + next[0] * 0.75, point[1] * 0.25 + next[1] * 0.75],
    ];
  });
}

function samePoint(a: LngLat, b: LngLat): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function ringsFromWays(ways: readonly LngLat[][]): LngLat[][] {
  const pending = ways.filter((way) => way.length >= 2).map((way) => way.slice());
  const rings: LngLat[][] = [];
  while (pending.length > 0) {
    const ring = pending.shift()!;
    let grew = true;
    while (!samePoint(ring[0]!, ring.at(-1)!) && grew) {
      grew = false;
      for (let index = 0; index < pending.length; index += 1) {
        const way = pending[index]!;
        const end = ring.at(-1)!;
        if (samePoint(way[0]!, end)) {
          ring.push(...way.slice(1));
        } else if (samePoint(way.at(-1)!, end)) {
          ring.push(...way.toReversed().slice(1));
        } else {
          continue;
        }
        pending.splice(index, 1);
        grew = true;
        break;
      }
    }
    if (samePoint(ring[0]!, ring.at(-1)!) && ring.length >= 4) {
      rings.push(ring.slice(0, -1));
    }
  }
  return rings;
}

export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^(nucleo habitacional|conjunto habitacional|jardim|parque|vila|residencial)\s+/, "")
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function edgeKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const scale = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return (Math.hypot((lng2 - lng1) * scale, lat2 - lat1) * METERS_PER_DEGREE) / 1000;
}

export function networkOwners(
  nodes: readonly LngLat[],
  edges: readonly (readonly [number, number])[],
  sources: readonly number[],
): { owner: Int32Array; distance: Float64Array } {
  const adjacency = Array.from({ length: nodes.length }, (): [number, number][] => []);
  for (const [from, to] of edges) {
    const length = edgeKm(nodes[from]!, nodes[to]!);
    adjacency[from]!.push([to, length]);
    adjacency[to]!.push([from, length]);
  }
  const owner = new Int32Array(nodes.length).fill(-1);
  const distance = new Float64Array(nodes.length).fill(Number.POSITIVE_INFINITY);
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent]![0] <= heap[index]![0]) {
        break;
      }
      [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
      index = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left]![0] < heap[smallest]![0]) {
          smallest = left;
        }
        if (right < heap.length && heap[right]![0] < heap[smallest]![0]) {
          smallest = right;
        }
        if (smallest === index) {
          break;
        }
        [heap[smallest], heap[index]] = [heap[index]!, heap[smallest]!];
        index = smallest;
      }
    }
    return top;
  };
  sources.forEach((node, sourceOwner) => {
    if (distance[node]! > 0) {
      distance[node] = 0;
      owner[node] = sourceOwner;
      push([0, node]);
    }
  });
  while (heap.length > 0) {
    const [current, node] = pop();
    if (current > distance[node]!) {
      continue;
    }
    for (const [next, length] of adjacency[node]!) {
      const candidate = current + length;
      if (candidate < distance[next]!) {
        distance[next] = candidate;
        owner[next] = owner[node]!;
        push([candidate, next]);
      }
    }
  }
  return { owner, distance };
}
