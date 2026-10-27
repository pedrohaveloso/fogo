import { centroid, pointInPolygon, polygonArea, type LngLat } from "../shared/geo.ts";
import { STATES, type StateCode } from "../shared/states.ts";
import type { BoundaryLookup, Municipality } from "../shared/types.ts";

const TIMEOUT_MS = 30_000;
const USER_AGENT = "FOGO/1.0 (cadastro de cidades)";
const BOUNDARY_SIMPLIFICATION = 0.0005;

type Position = [number, number];
type GeoJsonShape =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] }
  | { type: string; coordinates?: unknown };

type NominatimResult = {
  osm_type?: string;
  lat?: string;
  lon?: string;
  extratags?: Record<string, string> | null;
  geojson?: GeoJsonShape;
};

export class PlaceServiceError extends Error {}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `sem resposta em ${TIMEOUT_MS / 1000} s`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function getJson<T>(fetchImpl: typeof fetch, service: string, url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new PlaceServiceError(`${service}: ${describe(error)}`);
  }
  if (!response.ok) {
    throw new PlaceServiceError(`${service}: HTTP ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new PlaceServiceError(`${service}: ${describe(error)}`);
  }
}

export function createMunicipalityCache(fetchImpl: typeof fetch) {
  const cache = new Map<StateCode, Municipality[]>();

  return async function municipalities(uf: StateCode): Promise<Municipality[]> {
    const cached = cache.get(uf);
    if (cached) {
      return cached;
    }
    const body = await getJson<{ id: number; nome: string }[]>(
      fetchImpl,
      "IBGE",
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
    );
    const list = body.map((item) => ({ ibgeCode: item.id, name: item.nome }));
    cache.set(uf, list);
    return list;
  };
}

function rounded(ring: Position[]): LngLat[] {
  const points = ring.map(
    ([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as LngLat,
  );
  const first = points[0];
  const last = points.at(-1);
  return first && last && first[0] === last[0] && first[1] === last[1]
    ? points.slice(0, -1)
    : points;
}

export function outerRing(shape: GeoJsonShape | undefined): LngLat[] | null {
  if (shape?.type === "Polygon") {
    const [outer] = shape.coordinates as Position[][];
    return outer ? rounded(outer) : null;
  }
  if (shape?.type === "MultiPolygon") {
    const rings = (shape.coordinates as Position[][][])
      .map((polygon) => polygon[0])
      .filter((ring): ring is Position[] => ring !== undefined)
      .map(rounded);
    return rings.reduce<LngLat[] | null>(
      (best, ring) =>
        best === null || Math.abs(polygonArea(ring)) > Math.abs(polygonArea(best)) ? ring : best,
      null,
    );
  }
  return null;
}

export async function lookupBoundary(
  fetchImpl: typeof fetch,
  name: string,
  uf: StateCode,
  ibgeCode: number,
): Promise<BoundaryLookup | null> {
  const params = new URLSearchParams({
    format: "jsonv2",
    extratags: "1",
    polygon_geojson: "1",
    polygon_threshold: String(BOUNDARY_SIMPLIFICATION),
    countrycodes: "br",
    city: name,
    state: STATES[uf],
    limit: "5",
  });
  const results = await getJson<NominatimResult[]>(
    fetchImpl,
    "Nominatim",
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
  );
  const match =
    results.find((item) => item.extratags?.["IBGE:GEOCODIGO"] === String(ibgeCode)) ??
    results.find((item) => item.osm_type === "relation" && item.extratags?.["admin_level"] === "8");
  const boundary = outerRing(match?.geojson);
  if (!boundary || boundary.length < 3) {
    return null;
  }
  const place: LngLat | null =
    match?.lat && match.lon ? [Number(match.lon), Number(match.lat)] : null;
  const [lng, lat] = place && pointInPolygon(place, boundary) ? place : centroid(boundary);
  return { center: [Number(lng.toFixed(6)), Number(lat.toFixed(6))], boundary };
}
