import dataset from "../../data/marilia.json" with { type: "json" };
import { distanceKm, type LngLat } from "../shared/geo.ts";
import type { CityDataset, Neighborhood } from "../shared/types.ts";

export const city = dataset as CityDataset;

export const neighborhoodsById = new Map(city.neighborhoods.map((item) => [item.id, item]));
export const regionsById = new Map(city.regions.map((item) => [item.id, item]));

export function neighborhoodName(id: string): string {
  return neighborhoodsById.get(id)?.name ?? id;
}

export function regionOfNeighborhood(id: string): string {
  return neighborhoodsById.get(id)?.regionId ?? "center";
}

export function nearestNeighborhood(point: LngLat): Neighborhood {
  let best = city.neighborhoods[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const neighborhood of city.neighborhoods) {
    const distance = distanceKm(point, [neighborhood.lng, neighborhood.lat]);
    if (distance < bestDistance) {
      best = neighborhood;
      bestDistance = distance;
    }
  }
  return best;
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
