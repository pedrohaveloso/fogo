import { distanceKm, moveTowards, type LngLat } from "../shared/geo.ts";
import { HOUR } from "../shared/time.ts";

export type RoadEdge = [from: number, to: number, limitKmh: number, oneWay: 0 | 1];

export type RoadData = {
  source: string;
  generatedAt: string;
  nodes: LngLat[];
  edges: RoadEdge[];
};

export type TravelMode = { kmh: number; followsOneWay: boolean; limitFactor: number };

export type Journey = { from: number; path: number[]; position: LngLat; destination: number };

type Link = { to: number; km: number; limitKmh: number; allowed: boolean };

const CELL_DEGREES = 0.0025;
const CELL_KM = 0.25;
const MAX_RINGS = 200;

const cellOf = ([lng, lat]: LngLat): [number, number] => [
  Math.floor(lng / CELL_DEGREES),
  Math.floor(lat / CELL_DEGREES),
];

function speed(link: Link, mode: TravelMode): number {
  return Math.min(mode.kmh, link.limitKmh * mode.limitFactor);
}

export type RoadNetwork = ReturnType<typeof createRoadNetwork>;

export function createRoadNetwork(data: RoadData) {
  const nodes = data.nodes;
  const links = nodes.map((): Link[] => []);
  for (const [from, to, limitKmh, oneWay] of data.edges) {
    const km = distanceKm(nodes[from]!, nodes[to]!);
    links[from]!.push({ to, km, limitKmh, allowed: true });
    links[to]!.push({ to: from, km, limitKmh, allowed: oneWay === 0 });
  }

  const grid = new Map<string, number[]>();
  for (const [index, point] of nodes.entries()) {
    const [x, y] = cellOf(point);
    const key = `${x}:${y}`;
    const cell = grid.get(key) ?? [];
    cell.push(index);
    grid.set(key, cell);
  }

  function ring(center: [number, number], radius: number): number[] {
    const found: number[] = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
          found.push(...(grid.get(`${center[0] + dx}:${center[1] + dy}`) ?? []));
        }
      }
    }
    return found;
  }

  function nearestNode(point: LngLat): number {
    const center = cellOf(point);
    let best = -1;
    let bestKm = Number.POSITIVE_INFINITY;
    for (let radius = 0; radius <= MAX_RINGS && (radius - 1) * CELL_KM <= bestKm; radius += 1) {
      for (const index of ring(center, radius)) {
        const km = distanceKm(point, nodes[index]!);
        if (km < bestKm) {
          best = index;
          bestKm = km;
        }
      }
    }
    if (best < 0) {
      throw new Error("Malha viária vazia");
    }
    return best;
  }

  function nodesWithin(point: LngLat, km: number): number[] {
    const center = cellOf(point);
    const found: number[] = [];
    for (let radius = 0; radius <= Math.ceil(km / CELL_KM); radius += 1) {
      found.push(...ring(center, radius).filter((index) => distanceKm(point, nodes[index]!) <= km));
    }
    return found;
  }

  function search(from: number, to: number, mode: TravelMode, followsOneWay: boolean) {
    const cost = new Map<number, number>([[from, 0]]);
    const previous = new Map<number, number>();
    const done = new Set<number>();
    const heap = createHeap();
    heap.push(from, 0);
    const goal = nodes[to]!;
    while (heap.size() > 0) {
      const current = heap.pop();
      if (done.has(current)) {
        continue;
      }
      done.add(current);
      if (current === to) {
        const path = [to];
        while (path[0] !== from) {
          path.unshift(previous.get(path[0]!)!);
        }
        return path;
      }
      const base = cost.get(current)!;
      for (const link of links[current]!) {
        if (followsOneWay && !link.allowed) {
          continue;
        }
        const next = base + link.km / speed(link, mode);
        if (next < (cost.get(link.to) ?? Number.POSITIVE_INFINITY)) {
          cost.set(link.to, next);
          previous.set(link.to, current);
          heap.push(link.to, next + distanceKm(nodes[link.to]!, goal) / mode.kmh);
        }
      }
    }
    return null;
  }

  return {
    nodeCount: nodes.length,
    point: (index: number): LngLat => nodes[index]!,
    nearestNode,
    nodesWithin,
    route(from: number, to: number, mode: TravelMode): number[] {
      return (
        (mode.followsOneWay ? search(from, to, mode, true) : null) ??
        search(from, to, mode, false) ?? [from]
      );
    },
    kmhBetween(from: number, to: number, mode: TravelMode): number {
      const link = links[from]!.find((item) => item.to === to);
      return link ? speed(link, mode) : mode.kmh;
    },
  };
}

function createHeap() {
  const items: number[] = [];
  const priorities: number[] = [];
  const swap = (a: number, b: number) => {
    [items[a], items[b]] = [items[b]!, items[a]!];
    [priorities[a], priorities[b]] = [priorities[b]!, priorities[a]!];
  };
  return {
    size: () => items.length,
    push(item: number, priority: number) {
      items.push(item);
      priorities.push(priority);
      let index = items.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (priorities[parent]! <= priorities[index]!) {
          break;
        }
        swap(index, parent);
        index = parent;
      }
    },
    pop(): number {
      const top = items[0]!;
      swap(0, items.length - 1);
      items.pop();
      priorities.pop();
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && priorities[left]! < priorities[smallest]!) {
          smallest = left;
        }
        if (right < items.length && priorities[right]! < priorities[smallest]!) {
          smallest = right;
        }
        if (smallest === index) {
          return top;
        }
        swap(index, smallest);
        index = smallest;
      }
    },
  };
}

export function placeOnRoad(network: RoadNetwork, position: LngLat): Journey {
  const node = network.nearestNode(position);
  return { from: node, path: [], position: network.point(node), destination: node };
}

export function setDestination(
  network: RoadNetwork,
  journey: Journey,
  destination: number,
  mode: TravelMode,
): void {
  const heading = journey.path[0];
  journey.path =
    heading === undefined
      ? network.route(journey.from, destination, mode).slice(1)
      : network.route(heading, destination, mode);
  journey.destination = destination;
}

export function advance(
  network: RoadNetwork,
  journey: Journey,
  mode: TravelMode,
  ms: number,
): number {
  let hours = ms / HOUR;
  let traveled = 0;
  while (hours > 0 && journey.path.length > 0) {
    const next = journey.path[0]!;
    const target = network.point(next);
    const kmh = network.kmhBetween(journey.from, next, mode);
    const gap = distanceKm(journey.position, target);
    if (kmh * hours < gap) {
      journey.position = moveTowards(journey.position, target, kmh * hours);
      return traveled + kmh * hours;
    }
    traveled += gap;
    hours -= gap / kmh;
    journey.position = target;
    journey.from = next;
    journey.path.shift();
  }
  return traveled;
}
