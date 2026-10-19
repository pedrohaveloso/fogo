import { writeFile } from "node:fs/promises";
import {
  convexHull,
  distanceKm,
  roundPolygon,
  scalePolygon,
  voronoiCells,
  type LngLat,
} from "../src/shared/geo.ts";
import { overpass, USER_AGENT, type OsmElement } from "./overpass.ts";

const BBOX = { south: -22.275, north: -22.15, west: -50.03, east: -49.88 };
const CENTER_KM = 1.3;
const MIN_STREETS_PER_NEIGHBORHOOD = 6;
const CEP_STREETS_PER_NEIGHBORHOOD = 6;
const URBAN_MARGIN = 1.03;
const OUTPUT = new URL("../data/marilia.json", import.meta.url);

type ViaCepAddress = { cep: string; logradouro: string; bairro: string };

type Street = {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  neighborhoodId: string;
  cep: string | null;
};

const ROAD_RANK: Record<string, number> = {
  trunk: 0,
  primary: 1,
  secondary: 2,
  tertiary: 3,
  residential: 4,
};

const REGION_NAMES = {
  center: "Centro",
  north: "Zona Norte",
  east: "Zona Leste",
  south: "Zona Sul",
  west: "Zona Oeste",
} as const;

type RegionId = keyof typeof REGION_NAMES;

function position(element: OsmElement): LngLat | null {
  const lat = element.center?.lat ?? element.lat;
  const lon = element.center?.lon ?? element.lon;
  if (lat === undefined || lon === undefined) {
    return null;
  }
  return [lon, lat];
}

function insideBbox([lng, lat]: LngLat): boolean {
  return lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east;
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function normalize(text: string): string {
  return slugify(text).replaceAll("-", " ");
}

function regionOf(point: LngLat, center: LngLat): RegionId {
  if (distanceKm(point, center) < CENTER_KM) {
    return "center";
  }
  const dx = (point[0] - center[0]) * Math.cos((center[1] * Math.PI) / 180);
  const dy = point[1] - center[1];
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  if (bearing >= 315 || bearing < 45) {
    return "north";
  }
  if (bearing < 135) {
    return "east";
  }
  if (bearing < 225) {
    return "south";
  }
  return "west";
}

function nearest<T extends { lat: number; lng: number }>(items: T[], point: LngLat): T {
  let best = items[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const distance = distanceKm([item.lng, item.lat], point);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  if (!best) {
    throw new Error("Lista vazia");
  }
  return best;
}

async function lookupCep(street: string, neighborhood: string): Promise<string | null> {
  const url = `https://viacep.com.br/ws/SP/Marilia/${encodeURIComponent(street)}/json/`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    return null;
  }
  const results = (await response.json()) as ViaCepAddress[];
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  const exact = results.filter((result) => normalize(result.logradouro) === normalize(street));
  const candidates = exact.length > 0 ? exact : results;
  const sameNeighborhood = candidates.find(
    (result) => normalize(result.bairro) === normalize(neighborhood),
  );
  return (sameNeighborhood ?? candidates[0])?.cep ?? null;
}

async function main(): Promise<void> {
  const area = 'area["name"="Marília"]["admin_level"="8"]->.a;';
  const places = await overpass(
    `${area}(nwr(area.a)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];);out center tags;`,
  );
  const roads = await overpass(
    `${area}way(area.a)["highway"~"^(trunk|primary|secondary|tertiary|residential)$"]["name"];out center tags;`,
  );
  const poiElements = await overpass(
    `${area}(nwr(area.a)["shop"~"^(supermarket|mall)$"]["name"];nwr(area.a)["amenity"~"^(school|hospital|university|bus_station|fuel|bank)$"]["name"];nwr(area.a)["leisure"~"^(park|stadium)$"]["name"];);out center tags;`,
  );

  const cathedral = poiElements.find((element) => element.tags?.["name"]?.startsWith("Catedral"));
  const center: LngLat = (cathedral && position(cathedral)) ?? [-49.9458, -22.2139];

  const grouped = new Map<string, { name: string; points: LngLat[] }>();
  for (const place of places) {
    const name = place.tags?.["name"]?.replaceAll(/\s+/g, " ");
    const point = position(place);
    if (!name || !point || !insideBbox(point)) {
      continue;
    }
    const id = slugify(name.replace(/^(Núcleo|Conjunto) Habitacional /, ""));
    const entry = grouped.get(id) ?? { name, points: [] };
    entry.points.push(point);
    grouped.set(id, entry);
  }
  grouped.set("centro", { name: "Centro", points: [center] });

  let neighborhoods = [...grouped.entries()].map(([id, { name, points }]) => ({
    id,
    name,
    lng: points.reduce((sum, [lng]) => sum + lng, 0) / points.length,
    lat: points.reduce((sum, [, lat]) => sum + lat, 0) / points.length,
  }));

  const streetPoints = new Map<string, { name: string; kind: string; points: LngLat[] }>();
  for (const road of roads) {
    const name = road.tags?.["name"];
    const kind = road.tags?.["highway"];
    const point = position(road);
    if (!name || !kind || !point || !insideBbox(point)) {
      continue;
    }
    const key = `${name}|${Math.round(point[0] * 100)}|${Math.round(point[1] * 100)}`;
    const entry = streetPoints.get(key) ?? { name, kind, points: [] };
    entry.points.push(point);
    if ((ROAD_RANK[kind] ?? 9) < (ROAD_RANK[entry.kind] ?? 9)) {
      entry.kind = kind;
    }
    streetPoints.set(key, entry);
  }
  const rawStreets = [...streetPoints.values()].map(({ name, kind, points }) => ({
    name,
    kind,
    lng: points.reduce((sum, [lng]) => sum + lng, 0) / points.length,
    lat: points.reduce((sum, [, lat]) => sum + lat, 0) / points.length,
  }));

  for (let pass = 0; pass < 3; pass += 1) {
    const counts = new Map<string, number>();
    for (const street of rawStreets) {
      const owner = nearest(neighborhoods, [street.lng, street.lat]);
      counts.set(owner.id, (counts.get(owner.id) ?? 0) + 1);
    }
    neighborhoods = neighborhoods.filter(
      (neighborhood) =>
        neighborhood.id === "centro" ||
        (counts.get(neighborhood.id) ?? 0) >= MIN_STREETS_PER_NEIGHBORHOOD,
    );
  }

  const streets: Street[] = rawStreets.map(({ name, kind, lng, lat }) => ({
    name,
    kind,
    lng,
    lat,
    neighborhoodId: nearest(neighborhoods, [lng, lat]).id,
    cep: null,
  }));

  const urban = scalePolygon(
    convexHull(streets.map((street): LngLat => [street.lng, street.lat])),
    URBAN_MARGIN,
  );
  const cells = voronoiCells(
    neighborhoods.map((neighborhood): LngLat => [neighborhood.lng, neighborhood.lat]),
    urban,
  );
  const neighborhoodOutput = neighborhoods
    .map((neighborhood, index) => ({
      id: neighborhood.id,
      name: neighborhood.name,
      regionId: regionOf([neighborhood.lng, neighborhood.lat], center),
      lat: Number(neighborhood.lat.toFixed(6)),
      lng: Number(neighborhood.lng.toFixed(6)),
      polygon: roundPolygon(cells[index] ?? []),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const regionOutput = (Object.keys(REGION_NAMES) as RegionId[]).map((regionId) => {
    const memberIds = new Set(
      neighborhoodOutput.filter((item) => item.regionId === regionId).map((item) => item.id),
    );
    const points = neighborhoodOutput
      .filter((item) => memberIds.has(item.id))
      .flatMap((item) => item.polygon);
    return {
      id: regionId,
      name: REGION_NAMES[regionId],
      polygon: roundPolygon(convexHull(points)),
    };
  });

  const selected: Street[] = [];
  for (const neighborhood of neighborhoodOutput) {
    const own = streets
      .filter((street) => street.neighborhoodId === neighborhood.id)
      .sort((a, b) => (ROAD_RANK[a.kind] ?? 9) - (ROAD_RANK[b.kind] ?? 9));
    const unique = own.filter(
      (street, index) => own.findIndex((other) => other.name === street.name) === index,
    );
    for (const street of unique.slice(0, CEP_STREETS_PER_NEIGHBORHOOD)) {
      street.cep = await lookupCep(street.name, neighborhood.name);
      selected.push(street);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const pois = poiElements.flatMap((element) => {
    const point = position(element);
    const name = element.tags?.["name"];
    const kind =
      element.tags?.["shop"] ?? element.tags?.["amenity"] ?? element.tags?.["leisure"] ?? null;
    if (!point || !name || !kind || !insideBbox(point)) {
      return [];
    }
    return [
      {
        name,
        kind,
        lat: Number(point[1].toFixed(6)),
        lng: Number(point[0].toFixed(6)),
        neighborhoodId: nearest(neighborhoods, point).id,
      },
    ];
  });

  const dataset = {
    source: "OpenStreetMap (ODbL) e ViaCEP",
    generatedAt: new Date().toISOString(),
    city: {
      name: "Marília",
      uf: "SP",
      center,
      boundary: roundPolygon(urban),
    },
    regions: regionOutput,
    neighborhoods: neighborhoodOutput,
    streets: selected
      .filter((street) => street.cep)
      .map(({ name, kind, lng, lat, neighborhoodId, cep }) => ({
        name,
        kind,
        lng: Number(lng.toFixed(6)),
        lat: Number(lat.toFixed(6)),
        neighborhoodId,
        cep,
      })),
    pois,
  };

  await writeFile(OUTPUT, `${JSON.stringify(dataset)}\n`);
  console.log(
    `${neighborhoodOutput.length} bairros, ${dataset.streets.length} ruas com CEP, ${pois.length} pontos de referência`,
  );
}

await main();
