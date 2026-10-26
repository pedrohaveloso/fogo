import { centroid, pointInPolygon, type LngLat } from "../shared/geo.ts";
import { fold } from "../shared/text.ts";
import type { CityDataset, NeighborhoodShape, Region } from "../shared/types.ts";
import { findNeighborhood, reloadCity } from "./city.ts";
import type { Database } from "./db.ts";
import type { NeighborhoodDetails, NewNeighborhood } from "./validation.ts";

type ShapeRow = {
  id: string;
  edited: boolean;
  original_polygon: LngLat[] | null;
  original_lat: number | null;
  original_lng: number | null;
  updated_at: number;
};

export class NeighborhoodNameTakenError extends Error {}

export class NeighborhoodInUseError extends Error {}

export class RegionNameTakenError extends Error {}

export class RegionInUseError extends Error {}

export type NeighborhoodShapes = ReturnType<typeof createNeighborhoodShapes>;

function anchorFor(polygon: LngLat[], current: LngLat): LngLat {
  if (pointInPolygon(current, polygon)) {
    return current;
  }
  const [lng, lat] = centroid(polygon);
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

export function slugFor(name: string, fallback: string, taken: (id: string) => boolean): string {
  const base =
    fold(name)
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || fallback;
  let id = base;
  for (let suffix = 2; taken(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  return id;
}

export function createNeighborhoodShapes(db: Database, city: CityDataset) {
  const cityId = () => city.city.id;
  const reload = () => reloadCity(db, city);

  async function rows(): Promise<Map<string, ShapeRow>> {
    const found = await db.query<ShapeRow>(
      `SELECT id, original_polygon IS NOT NULL AND original_polygon <> polygon AS edited,
       original_polygon, original_lat, original_lng, updated_at
       FROM neighborhoods WHERE city_id = $1`,
      [cityId()],
    );
    return new Map(found.map((row) => [row.id, row]));
  }

  async function list(): Promise<NeighborhoodShape[]> {
    const stored = await rows();
    return city.neighborhoods.map((item) => {
      const row = stored.get(item.id);
      return {
        ...item,
        edited: row?.edited ?? false,
        custom: row?.original_polygon == null,
        updatedAt: row ? new Date(row.updated_at).toISOString() : null,
      };
    });
  }

  async function shapeOf(id: string): Promise<NeighborhoodShape | null> {
    return (await list()).find((item) => item.id === id) ?? null;
  }

  async function write(
    id: string,
    polygon: LngLat[],
    anchor: LngLat,
    now: number,
  ): Promise<NeighborhoodShape> {
    await db.run(
      "UPDATE neighborhoods SET polygon = $1, lat = $2, lng = $3, updated_at = $4 WHERE id = $5",
      [JSON.stringify(polygon), anchor[1], anchor[0], now, id],
    );
    await reload();
    return (await shapeOf(id))!;
  }

  async function save(
    id: string,
    polygon: LngLat[],
    now: number,
  ): Promise<NeighborhoodShape | null> {
    const neighborhood = findNeighborhood(city, id);
    if (!neighborhood) {
      return null;
    }
    return write(id, polygon, anchorFor(polygon, [neighborhood.lng, neighborhood.lat]), now);
  }

  async function reset(id: string, now: number): Promise<NeighborhoodShape | null> {
    const row = (await rows()).get(id);
    if (!row || row.original_polygon === null) {
      return null;
    }
    return write(id, row.original_polygon, [row.original_lng!, row.original_lat!], now);
  }

  function nameTaken(name: string, exceptId: string | null): boolean {
    const folded = fold(name);
    return city.neighborhoods.some((item) => item.id !== exceptId && fold(item.name) === folded);
  }

  async function freeId(table: "neighborhoods" | "regions", name: string, fallback: string) {
    const base = slugFor(name, fallback, () => false);
    const taken = new Set(
      (
        await db.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1 OR id LIKE $2`, [
          base,
          `${base}-%`,
        ])
      ).map((row) => row.id),
    );
    return slugFor(name, fallback, (candidate) => taken.has(candidate));
  }

  async function create(input: NewNeighborhood, now: number): Promise<NeighborhoodShape> {
    if (nameTaken(input.name, null)) {
      throw new NeighborhoodNameTakenError();
    }
    const id = await freeId("neighborhoods", input.name, "bairro");
    const [lng, lat] = anchorFor(input.polygon, centroid(input.polygon));
    await db.run(
      `INSERT INTO neighborhoods (id, city_id, region_id, name, polygon, lat, lng, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [id, cityId(), input.regionId, input.name, JSON.stringify(input.polygon), lat, lng, now],
    );
    await reload();
    return (await shapeOf(id))!;
  }

  async function update(
    id: string,
    input: NeighborhoodDetails,
    now: number,
  ): Promise<NeighborhoodShape | null> {
    if (!findNeighborhood(city, id)) {
      return null;
    }
    if (nameTaken(input.name, id)) {
      throw new NeighborhoodNameTakenError();
    }
    await db.run(
      "UPDATE neighborhoods SET name = $1, region_id = $2, updated_at = $3 WHERE id = $4",
      [input.name, input.regionId, now, id],
    );
    await reload();
    return shapeOf(id);
  }

  async function remove(id: string): Promise<boolean> {
    if (!findNeighborhood(city, id)) {
      return false;
    }
    const { total } = (await db.one<{ total: number }>(
      `SELECT (SELECT COUNT(*) FROM equipment WHERE neighborhood_id = $1)
        + (SELECT COUNT(*) FROM agents WHERE base_neighborhood_id = $1)
        + (SELECT COUNT(*) FROM occurrences WHERE neighborhood_id = $1) AS total`,
      [id],
    ))!;
    if (total > 0) {
      throw new NeighborhoodInUseError();
    }
    await db.run("DELETE FROM neighborhoods WHERE id = $1", [id]);
    await reload();
    return true;
  }

  function regionNameTaken(name: string, exceptId: string | null): boolean {
    const folded = fold(name);
    return city.regions.some((item) => item.id !== exceptId && fold(item.name) === folded);
  }

  async function createRegion(name: string, now: number): Promise<Region> {
    if (regionNameTaken(name, null)) {
      throw new RegionNameTakenError();
    }
    const id = await freeId("regions", name, "zona");
    await db.run("INSERT INTO regions (id, city_id, name, created_at) VALUES ($1, $2, $3, $4)", [
      id,
      cityId(),
      name,
      now,
    ]);
    await reload();
    return { id, name };
  }

  async function renameRegion(id: string, name: string): Promise<Region | null> {
    if (!city.regions.some((item) => item.id === id)) {
      return null;
    }
    if (regionNameTaken(name, id)) {
      throw new RegionNameTakenError();
    }
    await db.run("UPDATE regions SET name = $1 WHERE id = $2", [name, id]);
    await reload();
    return { id, name };
  }

  async function removeRegion(id: string): Promise<boolean> {
    if (!city.regions.some((item) => item.id === id)) {
      return false;
    }
    if (city.neighborhoods.some((item) => item.regionId === id)) {
      throw new RegionInUseError();
    }
    await db.run("DELETE FROM regions WHERE id = $1", [id]);
    await reload();
    return true;
  }

  return { list, save, reset, create, update, remove, createRegion, renameRegion, removeRegion };
}
