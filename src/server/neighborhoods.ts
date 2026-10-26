import { centroid, pointInPolygon, type LngLat } from "../shared/geo.ts";
import type { CityDataset, Neighborhood, NeighborhoodShape } from "../shared/types.ts";
import type { Database } from "./db.ts";

type ShapeRow = {
  neighborhood_id: string;
  polygon: string;
  lat: number;
  lng: number;
  edited: number;
  updated_at: number;
};

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

function toShape(neighborhood: Neighborhood, row: ShapeRow | undefined): NeighborhoodShape {
  return {
    ...neighborhood,
    edited: row?.edited === 1,
    updatedAt: row ? new Date(row.updated_at).toISOString() : null,
  };
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

  function load(now: number): void {
    storeDefaultShapes(db, city, now);
    for (const row of rows()) {
      apply(row);
    }
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
    return write(id, polygon, anchorFor(polygon, [neighborhood.lng, neighborhood.lat]), true, now);
  }

  function reset(id: string, now: number): NeighborhoodShape | null {
    const original = defaults.get(id);
    if (!original) {
      return null;
    }
    return write(id, original.polygon, original.anchor, false, now);
  }

  return { load, list, save, reset };
}
