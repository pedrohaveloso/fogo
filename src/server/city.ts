import { closestArea, type LngLat } from "../shared/geo.ts";
import type {
  Agency,
  CityDataset,
  CityInfo,
  Landmark,
  Neighborhood,
  PointOfInterest,
  Region,
  Street,
  StreetPlace,
} from "../shared/types.ts";
import type { Queryable } from "./db.ts";

export function findNeighborhood(city: CityDataset, id: string): Neighborhood | undefined {
  return city.neighborhoods.find((item) => item.id === id);
}

export function neighborhoodName(city: CityDataset, id: string): string {
  return findNeighborhood(city, id)?.name ?? id;
}

export function regionOfNeighborhood(city: CityDataset, id: string): string | null {
  return findNeighborhood(city, id)?.regionId ?? null;
}

export function nearestNeighborhood(city: CityDataset, point: LngLat): Neighborhood | undefined {
  return city.neighborhoods.length === 0 ? undefined : closestArea(city.neighborhoods, point);
}

export function findNeighborhoodByName(city: CityDataset, name: string): Neighborhood | null {
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

export function streetPlacesOf(source: CityDataset): StreetPlace[] {
  const seen = new Set<string>();
  return source.streets.flatMap(({ name, lat, lng, neighborhoodId }) => {
    const key = `${name}|${neighborhoodId}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ name, lat, lng, neighborhoodId }];
  });
}

type CityRow = {
  id: number;
  name: string;
  uf: string;
  ibge_code: number;
  center_lat: number;
  center_lng: number;
  boundary: LngLat[];
  simulated: boolean;
};

type NeighborhoodRow = {
  id: string;
  name: string;
  region_id: string;
  polygon: LngLat[];
  lat: number;
  lng: number;
};

type PlaceRow = {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  neighborhood_id: string;
  cep: string;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

function toCityInfo(row: CityRow): CityInfo {
  return {
    id: row.id,
    name: row.name,
    uf: row.uf,
    ibgeCode: row.ibge_code,
    center: [row.center_lng, row.center_lat],
    boundary: row.boundary,
    simulated: row.simulated,
  };
}

export async function loadCity(db: Queryable, id: number): Promise<CityDataset | null> {
  const row = await db.one<CityRow>("SELECT * FROM cities WHERE id = $1", [id]);
  if (!row) {
    return null;
  }
  const [regions, neighborhoods, streets, pois, agencies] = await Promise.all([
    db.query<Region>("SELECT id, name FROM regions WHERE city_id = $1", [id]),
    db.query<NeighborhoodRow>(
      "SELECT id, name, region_id, polygon, lat, lng FROM neighborhoods WHERE city_id = $1",
      [id],
    ),
    db.query<PlaceRow>(
      "SELECT name, kind, lat, lng, neighborhood_id, cep FROM streets WHERE city_id = $1 ORDER BY id",
      [id],
    ),
    db.query<Omit<PlaceRow, "cep">>(
      "SELECT name, kind, lat, lng, neighborhood_id FROM pois WHERE city_id = $1 ORDER BY id",
      [id],
    ),
    db.query<Agency>("SELECT id, name FROM agencies WHERE city_id = $1", [id]),
  ]);
  return {
    city: toCityInfo(row),
    regions: regions.sort(byName),
    neighborhoods: neighborhoods
      .map((item): Neighborhood => ({
        id: item.id,
        name: item.name,
        regionId: item.region_id,
        lat: item.lat,
        lng: item.lng,
        polygon: item.polygon,
      }))
      .sort(byName),
    streets: streets.map((street): Street => ({
      name: street.name,
      kind: street.kind,
      lat: street.lat,
      lng: street.lng,
      cep: street.cep,
      neighborhoodId: street.neighborhood_id,
    })),
    pois: pois.map((poi): PointOfInterest => ({
      name: poi.name,
      kind: poi.kind,
      lat: poi.lat,
      lng: poi.lng,
      neighborhoodId: poi.neighborhood_id,
    })),
    agencies: agencies.sort(byName),
  };
}

export async function reloadCity(db: Queryable, city: CityDataset): Promise<void> {
  const fresh = await loadCity(db, city.city.id);
  if (fresh) {
    Object.assign(city, fresh);
  }
}

export type NewCityRecord = {
  name: string;
  uf: string;
  ibgeCode: number;
  center: LngLat;
  boundary: LngLat[];
  simulated: boolean;
};

export async function insertCity(
  db: Queryable,
  input: NewCityRecord,
  now: number,
): Promise<number> {
  const row = await db.one<{ id: number }>(
    `INSERT INTO cities (name, uf, ibge_code, center_lat, center_lng, boundary, simulated, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [
      input.name,
      input.uf,
      input.ibgeCode,
      input.center[1],
      input.center[0],
      JSON.stringify(input.boundary),
      input.simulated,
      now,
    ],
  );
  return row!.id;
}
