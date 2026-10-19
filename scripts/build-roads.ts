import { readFile, writeFile } from "node:fs/promises";
import { pointInPolygon, type LngLat } from "../src/shared/geo.ts";
import type { CityDataset } from "../src/shared/types.ts";
import type { RoadData, RoadEdge } from "../src/server/roads.ts";
import { overpass } from "./overpass.ts";

const CITY = new URL("../data/marilia.json", import.meta.url);
const OUTPUT = new URL("../data/marilia-roads.json", import.meta.url);
const SIMPLIFY_METERS = 3;
const METERS_PER_DEGREE = 111_320;

const DEFAULT_LIMITS: Record<string, number> = {
  trunk: 60,
  trunk_link: 40,
  primary: 60,
  primary_link: 40,
  secondary: 50,
  secondary_link: 40,
  tertiary: 40,
  tertiary_link: 30,
  unclassified: 40,
  residential: 30,
  living_street: 20,
};

function speedLimit(tags: Record<string, string>): number {
  const tagged = Number.parseInt(tags["maxspeed"] ?? "", 10);
  return Number.isFinite(tagged) && tagged > 0
    ? tagged
    : (DEFAULT_LIMITS[tags["highway"] ?? ""] ?? 30);
}

function oneWay(tags: Record<string, string>): 1 | 0 | -1 {
  const value = tags["oneway"];
  if (value === "-1") {
    return -1;
  }
  return value === "yes" || value === "true" || value === "1" || tags["junction"] === "roundabout"
    ? 1
    : 0;
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

function simplify(chain: number[], points: Map<number, LngLat>): number[] {
  if (chain.length <= 2) {
    return chain;
  }
  const start = points.get(chain[0]!)!;
  const end = points.get(chain.at(-1)!)!;
  let farthest = 0;
  let farthestIndex = 0;
  for (let index = 1; index < chain.length - 1; index += 1) {
    const offset = offsetMeters(points.get(chain[index]!)!, start, end);
    if (offset > farthest) {
      farthest = offset;
      farthestIndex = index;
    }
  }
  if (farthest <= SIMPLIFY_METERS) {
    return [chain[0]!, chain.at(-1)!];
  }
  return [
    ...simplify(chain.slice(0, farthestIndex + 1), points).slice(0, -1),
    ...simplify(chain.slice(farthestIndex), points),
  ];
}

function largestComponent(count: number, edges: RoadEdge[]): Set<number> {
  const neighbors = Array.from({ length: count }, (): number[] => []);
  for (const [from, to] of edges) {
    neighbors[from]!.push(to);
    neighbors[to]!.push(from);
  }
  const seen = new Uint8Array(count);
  let best: number[] = [];
  for (let start = 0; start < count; start += 1) {
    if (seen[start]) {
      continue;
    }
    seen[start] = 1;
    const component = [start];
    for (let index = 0; index < component.length; index += 1) {
      for (const next of neighbors[component[index]!]!) {
        if (!seen[next]) {
          seen[next] = 1;
          component.push(next);
        }
      }
    }
    if (component.length > best.length) {
      best = component;
    }
  }
  return new Set(best);
}

async function main(): Promise<void> {
  const city = JSON.parse(await readFile(CITY, "utf8")) as CityDataset;
  const elements = await overpass(
    `area["name"="Marília"]["admin_level"="8"]->.a;way(area.a)["highway"~"^(${Object.keys(DEFAULT_LIMITS).join("|")})$"]["access"!~"^(no|private)$"];out body;>;out skel qt;`,
  );

  const points = new Map<number, LngLat>();
  for (const element of elements) {
    if (element.type === "node" && element.lat !== undefined && element.lon !== undefined) {
      const point: LngLat = [element.lon, element.lat];
      if (pointInPolygon(point, city.city.boundary)) {
        points.set(element.id, point);
      }
    }
  }

  const ways = elements.flatMap((element) => {
    if (element.type !== "way" || !element.nodes || !element.tags) {
      return [];
    }
    const direction = oneWay(element.tags);
    const refs = direction === -1 ? element.nodes.toReversed() : element.nodes;
    const runs: number[][] = [[]];
    for (const ref of refs) {
      if (points.has(ref)) {
        runs.at(-1)!.push(ref);
      } else if (runs.at(-1)!.length > 0) {
        runs.push([]);
      }
    }
    return runs
      .filter((run) => run.length >= 2)
      .map((run) => ({
        refs: run,
        limit: speedLimit(element.tags!),
        oneWay: direction === 0 ? 0 : 1,
      }));
  });

  const usage = new Map<number, number>();
  for (const way of ways) {
    for (const [index, ref] of way.refs.entries()) {
      const weight = index === 0 || index === way.refs.length - 1 ? 2 : 1;
      usage.set(ref, (usage.get(ref) ?? 0) + weight);
    }
  }

  const indexOf = new Map<number, number>();
  const nodes: LngLat[] = [];
  const nodeIndex = (ref: number): number => {
    let index = indexOf.get(ref);
    if (index === undefined) {
      index = nodes.length;
      indexOf.set(ref, index);
      nodes.push(points.get(ref)!);
    }
    return index;
  };
  const seen = new Set<string>();
  const rawEdges: RoadEdge[] = [];
  for (const way of ways) {
    let chain = [way.refs[0]!];
    for (const ref of way.refs.slice(1)) {
      chain.push(ref);
      if ((usage.get(ref) ?? 0) < 2) {
        continue;
      }
      const kept = simplify(chain, points);
      for (let index = 1; index < kept.length; index += 1) {
        const from = nodeIndex(kept[index - 1]!);
        const to = nodeIndex(kept[index]!);
        const key = from < to ? `${from}-${to}` : `${to}-${from}`;
        if (from !== to && !seen.has(key)) {
          seen.add(key);
          rawEdges.push([from, to, way.limit, way.oneWay as 0 | 1]);
        }
      }
      chain = [ref];
    }
  }

  const component = largestComponent(nodes.length, rawEdges);
  const remap = new Map<number, number>();
  const output: RoadData = {
    source: "OpenStreetMap (ODbL)",
    generatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
  };
  for (const [index, [lng, lat]] of nodes.entries()) {
    if (component.has(index)) {
      remap.set(index, output.nodes.length);
      output.nodes.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
    }
  }
  for (const [from, to, limit, direction] of rawEdges) {
    const a = remap.get(from);
    const b = remap.get(to);
    if (a !== undefined && b !== undefined) {
      output.edges.push([a, b, limit, direction]);
    }
  }

  await writeFile(OUTPUT, `${JSON.stringify(output)}\n`);
  console.log(`${output.nodes.length} pontos e ${output.edges.length} trechos de rua`);
}

await main();
