import { readFileSync } from "node:fs";
import dataset from "../../data/marilia.json" with { type: "json" };
import { closestArea, type LngLat } from "../shared/geo.ts";
import type { CityDataset, Landmark, Neighborhood } from "../shared/types.ts";
import { createRoadNetwork, type RoadData } from "./roads.ts";

export const city = dataset as CityDataset;

export const roads = createRoadNetwork(
  JSON.parse(
    readFileSync(new URL("../../data/marilia-roads.json", import.meta.url), "utf8"),
  ) as RoadData,
);

export const neighborhoodsById = new Map(city.neighborhoods.map((item) => [item.id, item]));
export const regionsById = new Map(city.regions.map((item) => [item.id, item]));

export function neighborhoodName(id: string): string {
  return neighborhoodsById.get(id)?.name ?? id;
}

export function regionOfNeighborhood(id: string): string {
  return neighborhoodsById.get(id)?.regionId ?? "center";
}

export function nearestNeighborhood(point: LngLat): Neighborhood {
  return closestArea(city.neighborhoods, point);
}

export function findNeighborhoodByName(name: string): Neighborhood | null {
  const normalized = normalizeName(name);
  return city.neighborhoods.find((item) => normalizeName(item.name) === normalized) ?? null;
}

export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

const LANDMARK_KINDS = new Set([
  "hospital",
  "university",
  "mall",
  "stadium",
  "bus_station",
  "park",
]);

export function landmarksOf(source: CityDataset): Landmark[] {
  return source.pois
    .filter((poi) => LANDMARK_KINDS.has(poi.kind))
    .map(({ name, kind, lat, lng }) => ({ name, kind, lat, lng }));
}
