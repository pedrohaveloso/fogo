import { centroid, pointInPolygon, type LngLat } from "../shared/geo.ts";
import { fold } from "../shared/text.ts";
import type { CityDataset, Neighborhood, NeighborhoodShape } from "../shared/types.ts";
import { transaction, type Database } from "./db.ts";
import type { NewNeighborhood } from "./validation.ts";

type ShapeRow = {
  neighborhood_id: string;
  polygon: string;
  lat: number;
  lng: number;
  edited: number;
  updated_at: number;
};

type CustomRow = { id: string; name: string; region_id: string };

export class NeighborhoodNameTakenError extends Error {}

export class NeighborhoodInUseError extends Error {}

export type NeighborhoodShapes = ReturnType<typeof createNeighborhoodShapes>;

export function storeDefaultShapes(db: Database, city: CityDataset, now: number): void {
  const insert = db.prepare(
    `INSERT INTO neighborhood_shapes (neighborhood_id, polygon, lat, lng, edited, updated_at)
     VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT (neighborhood_id) DO NOTHING`,
  );
  for (const item of city.neighborhoods) {
    insert.run(item.id, JSON.stringify(item.polygon), item.lat, item.lng, now);
  }
}

function anchorFor(polygon: LngLat[], current: LngLat): LngLat {
  if (pointInPolygon(current, polygon)) {
    return current;
  }
  const [lng, lat] = centroid(polygon);
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

export function slugFor(name: string, taken: (id: string) => boolean): string {
  const base =
    fold(name)
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "") || "bairro";
  let id = base;
  for (let suffix = 2; taken(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  return id;
}

export function createNeighborhoodShapes(db: Database, city: CityDataset) {
  const defaults = new Map(
    city.neighborhoods.map((item) => [
      item.id,
      { polygon: item.polygon, anchor: [item.lng, item.lat] as LngLat },
    ]),
  );
  const byId = new Map(city.neighborhoods.map((item) => [item.id, item]));

  function rows(): ShapeRow[] {
    return db.prepare("SELECT * FROM neighborhood_shapes").all() as ShapeRow[];
  }

  function apply(row: ShapeRow): void {
    const neighborhood = byId.get(row.neighborhood_id);
    if (neighborhood) {
      neighborhood.polygon = JSON.parse(row.polygon) as LngLat[];
      neighborhood.lat = row.lat;
      neighborhood.lng = row.lng;
    }
  }

  function rowOf(id: string): ShapeRow | undefined {
    return db.prepare("SELECT * FROM neighborhood_shapes WHERE neighborhood_id = ?").get(id) as
      | ShapeRow
      | undefined;
  }

  function adopt(row: CustomRow): void {
    if (byId.has(row.id)) {
      return;
    }
    const neighborhood: Neighborhood = {
      id: row.id,
      name: row.name,
      regionId: row.region_id,
      lat: 0,
      lng: 0,
      polygon: [],
    };
    city.neighborhoods.push(neighborhood);
    byId.set(row.id, neighborhood);
  }

  function load(now: number): void {
    for (const row of db.prepare("SELECT * FROM custom_neighborhoods").all() as CustomRow[]) {
      adopt(row);
    }
    storeDefaultShapes(db, city, now);
    for (const row of rows()) {
      apply(row);
    }
  }

  function toShape(neighborhood: Neighborhood, row: ShapeRow | undefined): NeighborhoodShape {
    return {
      ...neighborhood,
      edited: row?.edited === 1,
      custom: !defaults.has(neighborhood.id),
      updatedAt: row ? new Date(row.updated_at).toISOString() : null,
    };
  }

  function list(): NeighborhoodShape[] {
    const stored = new Map(rows().map((row) => [row.neighborhood_id, row]));
    return city.neighborhoods.map((item) => toShape(item, stored.get(item.id)));
  }

  function write(id: string, polygon: LngLat[], anchor: LngLat, edited: boolean, now: number) {
    db.prepare(
      `INSERT INTO neighborhood_shapes (neighborhood_id, polygon, lat, lng, edited, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (neighborhood_id) DO UPDATE SET polygon = excluded.polygon, lat = excluded.lat,
       lng = excluded.lng, edited = excluded.edited, updated_at = excluded.updated_at`,
    ).run(id, JSON.stringify(polygon), anchor[1], anchor[0], edited ? 1 : 0, now);
    const row = rowOf(id)!;
    apply(row);
    return toShape(byId.get(id)!, row);
  }

  function save(id: string, polygon: LngLat[], now: number): NeighborhoodShape | null {
    const neighborhood = byId.get(id);
    if (!neighborhood) {
      return null;
    }
    const edited = defaults.has(id);
    return write(
      id,
      polygon,
      anchorFor(polygon, [neighborhood.lng, neighborhood.lat]),
      edited,
      now,
    );
  }

  function reset(id: string, now: number): NeighborhoodShape | null {
    const original = defaults.get(id);
    if (!original) {
      return null;
    }
    return write(id, original.polygon, original.anchor, false, now);
  }

  function create(input: NewNeighborhood, now: number): NeighborhoodShape {
    const name = fold(input.name);
    if (city.neighborhoods.some((item) => fold(item.name) === name)) {
      throw new NeighborhoodNameTakenError();
    }
    const id = slugFor(input.name, (candidate) => byId.has(candidate));
    return transaction(db, () => {
      db.prepare(
        "INSERT INTO custom_neighborhoods (id, name, region_id, created_at) VALUES (?, ?, ?, ?)",
      ).run(id, input.name, input.regionId, now);
      adopt({ id, name: input.name, region_id: input.regionId });
      return write(
        id,
        input.polygon,
        anchorFor(input.polygon, centroid(input.polygon)),
        false,
        now,
      );
    });
  }

  function remove(id: string): boolean {
    if (defaults.has(id) || !byId.has(id)) {
      return false;
    }
    const { total } = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM equipment WHERE neighborhood_id = ?)
          + (SELECT COUNT(*) FROM agents WHERE base_neighborhood_id = ?)
          + (SELECT COUNT(*) FROM occurrences WHERE neighborhood_id = ?) AS total`,
      )
      .get(id, id, id) as { total: number };
    if (total > 0) {
      throw new NeighborhoodInUseError();
    }
    transaction(db, () => {
      db.prepare("DELETE FROM neighborhood_shapes WHERE neighborhood_id = ?").run(id);
      db.prepare("DELETE FROM custom_neighborhoods WHERE id = ?").run(id);
    });
    city.neighborhoods.splice(
      city.neighborhoods.findIndex((item) => item.id === id),
      1,
    );
    byId.delete(id);
    return true;
  }

  return { load, list, save, reset, create, remove };
}
