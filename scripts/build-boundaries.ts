import { readFile, writeFile } from "node:fs/promises";
import { distanceKm, pointInPolygon, roundPolygon, type LngLat } from "../src/shared/geo.ts";
import type { CityDataset } from "../src/shared/types.ts";
import type { RoadData } from "../src/server/roads.ts";
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
  smoothRing,
} from "./boundaries.ts";
import { overpass, type OsmElement } from "./overpass.ts";

const CITY = new URL("../data/marilia.json", import.meta.url);
const ROADS = new URL("../data/marilia-roads.json", import.meta.url);
const CELL_METERS = 40;
const URBAN_RADIUS_CELLS = 4;
const MARGIN_DEGREES = 0.004;
const SIMPLIFY_METERS = 35;
const MUNICIPALITY = "rel(298306);map_to_area->.a;";

function line(element: OsmElement): LngLat[] {
  return (element.geometry ?? []).map((point): LngLat => [point.lon, point.lat]);
}

function polygonsOf(element: OsmElement): LngLat[][] {
  if (element.type === "way") {
    const ring = line(element);
    return ring.length >= 4 ? [ring.slice(0, -1)] : [];
  }
  const outer = (element.members ?? [])
    .filter((member) => member.type === "way" && member.role !== "inner")
    .map((member) => (member.geometry ?? []).map((point): LngLat => [point.lon, point.lat]));
  return ringsFromWays(outer);
}

async function main(): Promise<void> {
  const city = JSON.parse(await readFile(CITY, "utf8")) as CityDataset;
  const roads = JSON.parse(await readFile(ROADS, "utf8")) as RoadData;

  const barriers = await overpass(
    `${MUNICIPALITY}(way(area.a)["waterway"~"^(river|stream|canal)$"];way(area.a)["railway"="rail"];);out geom;`,
  );
  const areas = await overpass(
    `${MUNICIPALITY}(way(area.a)["place"~"^(suburb|neighbourhood|quarter)$"];rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];);out geom;`,
  );

  const lngs = roads.nodes.map(([lng]) => lng);
  const lats = roads.nodes.map(([, lat]) => lat);
  const grid = createGrid(
    {
      west: Math.min(...lngs) - MARGIN_DEGREES,
      east: Math.max(...lngs) + MARGIN_DEGREES,
      south: Math.min(...lats) - MARGIN_DEGREES,
      north: Math.max(...lats) + MARGIN_DEGREES,
    },
    CELL_METERS,
  );

  const roadLines = roads.edges.map(([from, to]) => [roads.nodes[from]!, roads.nodes[to]!]);
  const urban = fillHoles(grid, dilate(grid, rasterizeLines(grid, roadLines), URBAN_RADIUS_CELLS));
  const barrier = rasterizeLines(grid, barriers.map(line));

  const sources = city.neighborhoods.map((neighborhood) => {
    const point: LngLat = [neighborhood.lng, neighborhood.lat];
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    roads.nodes.forEach((node, index) => {
      const distance = distanceKm(point, node);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  });
  const network = networkOwners(
    roads.nodes,
    roads.edges.map(([from, to]) => [from, to] as const),
    sources,
  );

  const seeds = new Map<number, number>();
  const seedDistance = new Map<number, number>();
  roads.nodes.forEach((node, index) => {
    const cell = cellOf(grid, node);
    const owner = network.owner[index]!;
    const distance = network.distance[index]!;
    if (
      cell >= 0 &&
      owner >= 0 &&
      distance < (seedDistance.get(cell) ?? Number.POSITIVE_INFINITY)
    ) {
      seeds.set(cell, owner);
      seedDistance.set(cell, distance);
    }
  });

  const owner = growOwners(grid, seeds, urban, barrier);
  fillUnowned(grid, owner, urban);

  const byKey = new Map(city.neighborhoods.map((item, index) => [nameKey(item.name), index]));
  const matched: string[] = [];
  for (const element of areas) {
    const index = byKey.get(nameKey(element.tags?.["name"] ?? ""));
    const polygons = polygonsOf(element);
    if (index === undefined || polygons.length === 0) {
      continue;
    }
    matched.push(city.neighborhoods[index]!.name);
    const inside = (point: LngLat) => polygons.some((ring) => pointInPolygon(point, ring));
    const nested = new Set(
      city.neighborhoods.flatMap((item, other) =>
        other !== index && inside([item.lng, item.lat]) ? [other] : [],
      ),
    );
    for (let cell = 0; cell < owner.length; cell += 1) {
      if (urban[cell] && !nested.has(owner[cell]!) && inside(cellCenter(grid, cell))) {
        owner[cell] = index;
      }
    }
  }

  const anchors = city.neighborhoods.map((item) => cellOf(grid, [item.lng, item.lat]));
  keepMainComponents(grid, owner, anchors);

  const ring = (isInside: (cell: number) => boolean) =>
    roundPolygon(smoothRing(simplifyRing(outerRing(grid, isInside), SIMPLIFY_METERS)));

  const empty: string[] = [];
  city.neighborhoods.forEach((neighborhood, index) => {
    neighborhood.polygon = ring((cell) => owner[cell] === index);
    if (neighborhood.polygon.length < 3) {
      empty.push(neighborhood.name);
    }
  });

  const regionOf = city.neighborhoods.map((item) => item.regionId);
  for (const region of city.regions) {
    region.polygon = ring((cell) => owner[cell]! >= 0 && regionOf[owner[cell]!] === region.id);
  }

  for (const place of [...city.streets, ...city.pois]) {
    const cell = cellOf(grid, [place.lng, place.lat]);
    const value = cell >= 0 ? owner[cell]! : -1;
    if (value >= 0) {
      place.neighborhoodId = city.neighborhoods[value]!.id;
    }
  }
  city.source =
    "OpenStreetMap (ODbL): bairros, ruas, rios, ferrovia e pontos de referência; ViaCEP: CEPs. Limites de bairro aproximados, calculados pela malha viária.";

  await writeFile(CITY, `${JSON.stringify(city)}\n`);
  console.log(
    `${city.neighborhoods.length} bairros, ${barriers.length} rios, córregos e trechos de ferrovia como barreira`,
  );
  console.log(`Polígonos do OpenStreetMap usados: ${matched.join(", ") || "nenhum"}`);
  if (empty.length > 0) {
    console.log(`Bairros sem área própria: ${empty.join(", ")}`);
  }
}

await main();
