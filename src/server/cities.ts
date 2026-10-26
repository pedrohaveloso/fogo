import { centroid, pointInPolygon, type LngLat } from "../shared/geo.ts";
import type { CityDataset, CityDetail, CitySummary } from "../shared/types.ts";
import { insertCity, loadCity, reloadCity } from "./city.ts";
import type { Database } from "./db.ts";
import { createLiveHub, type LiveHub } from "./live.ts";
import { createNeighborhoodShapes, type NeighborhoodShapes } from "./neighborhoods.ts";
import { createPredictionService, type PredictionService } from "./predictions/service.ts";
import type { NewCity } from "./validation.ts";

export type CityContext = {
  city: CityDataset;
  shapes: NeighborhoodShapes;
  predictions: PredictionService;
  hub: LiveHub;
  liveMultiplier: number;
  reload: () => Promise<void>;
};

export type CityRegistry = Awaited<ReturnType<typeof createCityRegistry>>;

export class CityTakenError extends Error {}

export class CityInUseError extends Error {}

function centerOf(boundary: LngLat[], preferred: LngLat | null): LngLat {
  if (preferred && pointInPolygon(preferred, boundary)) {
    return preferred;
  }
  const [lng, lat] = centroid(boundary);
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

export async function createCityRegistry(db: Database, options: { liveMultiplier: number }) {
  const contexts = new Map<number, CityContext>();

  function open(city: CityDataset): CityContext {
    const liveMultiplier = city.city.simulated ? options.liveMultiplier : 1;
    const predictions = createPredictionService(db, city, liveMultiplier);
    const context: CityContext = {
      city,
      shapes: createNeighborhoodShapes(db, city),
      predictions,
      hub: createLiveHub(db, city, predictions),
      liveMultiplier,
      reload: async () => {
        await reloadCity(db, city);
        predictions.invalidate();
      },
    };
    contexts.set(city.city.id, context);
    return context;
  }

  for (const { id } of await db.query<{ id: number }>("SELECT id FROM cities")) {
    open((await loadCity(db, id))!);
  }

  function all(): CityContext[] {
    return [...contexts.values()];
  }

  function summaries(ids: readonly number[] | null): CitySummary[] {
    return all()
      .filter((context) => ids === null || ids.includes(context.city.city.id))
      .map(({ city: { city } }) => ({
        id: city.id,
        name: city.name,
        uf: city.uf,
        ibgeCode: city.ibgeCode,
        simulated: city.simulated,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.uf.localeCompare(b.uf));
  }

  async function usage(id: number) {
    return (await db.one<{ equipment: number; agents: number; occurrences: number }>(
      `SELECT (SELECT COUNT(*) FROM equipment WHERE city_id = $1) AS equipment,
       (SELECT COUNT(*) FROM agents WHERE city_id = $1) AS agents,
       (SELECT COUNT(*) FROM occurrences WHERE city_id = $1) AS occurrences`,
      [id],
    ))!;
  }

  async function detail(id: number): Promise<CityDetail | null> {
    const context = contexts.get(id);
    if (!context) {
      return null;
    }
    const { city } = context.city;
    const counts = await usage(id);
    return {
      id: city.id,
      name: city.name,
      uf: city.uf,
      ibgeCode: city.ibgeCode,
      simulated: city.simulated,
      center: city.center,
      boundary: city.boundary,
      equipment: counts.equipment,
      agents: counts.agents,
      neighborhoods: context.city.neighborhoods.length,
    };
  }

  async function create(input: NewCity, now: number): Promise<CityContext> {
    const taken = await db.one("SELECT 1 FROM cities WHERE ibge_code = $1", [input.ibgeCode]);
    if (taken) {
      throw new CityTakenError();
    }
    const id = await insertCity(
      db,
      {
        name: input.name,
        uf: input.uf,
        ibgeCode: input.ibgeCode,
        center: centerOf(input.boundary, input.center),
        boundary: input.boundary,
        simulated: false,
      },
      now,
    );
    return open((await loadCity(db, id))!);
  }

  async function updateBoundary(
    id: number,
    boundary: CityDataset["city"]["boundary"],
    now: number,
  ): Promise<CityContext | null> {
    const context = contexts.get(id);
    if (!context) {
      return null;
    }
    const [lng, lat] = centerOf(boundary, context.city.city.center);
    await db.run(
      "UPDATE cities SET boundary = $1, center_lat = $2, center_lng = $3, updated_at = $4 WHERE id = $5",
      [JSON.stringify(boundary), lat, lng, now, id],
    );
    await context.reload();
    return context;
  }

  async function remove(id: number): Promise<boolean> {
    if (!contexts.has(id)) {
      return false;
    }
    const counts = await usage(id);
    if (counts.equipment + counts.agents + counts.occurrences > 0) {
      throw new CityInUseError();
    }
    await db.run("DELETE FROM cities WHERE id = $1", [id]);
    contexts.delete(id);
    return true;
  }

  return {
    get: (id: number) => contexts.get(id),
    all,
    summaries,
    detail,
    create,
    updateBoundary,
    remove,
  };
}
