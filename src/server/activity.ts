import { EQUIPMENT_TYPES, OCCURRENCE_KINDS, STATUS_LABELS } from "../shared/catalog.ts";
import type { EquipmentStatus } from "../shared/catalog.ts";
import type { ActivityFeed, ActivityItem, CityDataset } from "../shared/types.ts";
import { neighborhoodName } from "./city.ts";
import type { Queryable } from "./db.ts";

const MAX_ITEMS = 300;
const DOWN_STATUSES = new Set<string>(["malfunction", "maintenance", "stolen"]);

type OccurrenceRow = {
  id: number;
  kind: keyof typeof OCCURRENCE_KINDS;
  neighborhood_id: string;
  description: string;
  created_at: number;
  resolved_at: number | null;
};

type StatusRow = {
  id: number;
  equipment_id: number;
  status: EquipmentStatus;
  reason: string;
  at: number;
  type: keyof typeof EQUIPMENT_TYPES;
  serial_number: string;
  neighborhood_id: string;
};

export async function loadActivity(
  db: Queryable,
  city: CityDataset,
  since: number,
): Promise<ActivityFeed> {
  const cityId = city.city.id;
  const neighborhood = (id: string) => neighborhoodName(city, id);
  const items: (ActivityItem & { time: number })[] = [];

  const occurrences = await db.query<OccurrenceRow>(
    `SELECT id, kind, neighborhood_id, description, created_at, resolved_at FROM occurrences
     WHERE city_id = $1 AND (created_at >= $2 OR resolved_at >= $2)`,
    [cityId, since],
  );
  for (const row of occurrences) {
    const label = OCCURRENCE_KINDS[row.kind].label;
    const target = { kind: "occurrence", id: row.id } as const;
    if (row.created_at >= since) {
      items.push({
        id: `occurrence-opened-${row.id}`,
        time: row.created_at,
        at: new Date(row.created_at).toISOString(),
        kind: "occurrence_opened",
        title: label,
        detail: `${row.description}, em ${neighborhood(row.neighborhood_id)}`,
        neighborhoodId: row.neighborhood_id,
        target,
      });
    }
    if (row.resolved_at !== null && row.resolved_at >= since) {
      items.push({
        id: `occurrence-resolved-${row.id}`,
        time: row.resolved_at,
        at: new Date(row.resolved_at).toISOString(),
        kind: "occurrence_resolved",
        title: `Encerramento: ${label}`,
        detail: `Em ${neighborhood(row.neighborhood_id)}`,
        neighborhoodId: row.neighborhood_id,
        target,
      });
    }
  }

  const statusChanges = await db.query<StatusRow>(
    `SELECT e.id, e.equipment_id, e.status, e.reason, e.at, q.type, q.serial_number, q.neighborhood_id
       FROM equipment_status_events e JOIN equipment q ON q.id = e.equipment_id
       WHERE q.city_id = $1 AND e.at >= $2 AND (e.status = 'operational' OR e.status IN ('malfunction', 'maintenance', 'stolen'))`,
    [cityId, since],
  );
  for (const row of statusChanges) {
    const down = DOWN_STATUSES.has(row.status);
    const name = `${EQUIPMENT_TYPES[row.type].label} ${row.serial_number}`;
    items.push({
      id: `equipment-${row.id}`,
      time: row.at,
      at: new Date(row.at).toISOString(),
      kind: down ? "equipment_down" : "equipment_restored",
      title: down
        ? `${name}: ${STATUS_LABELS[row.status].toLowerCase()}`
        : `${name} voltou a operar`,
      detail: `${row.reason ? `${row.reason}, em ` : "Em "}${neighborhood(row.neighborhood_id)}`,
      neighborhoodId: row.neighborhood_id,
      target: { kind: "equipment", id: row.equipment_id },
    });
  }

  items.sort((a, b) => b.time - a.time);
  return {
    since: new Date(since).toISOString(),
    items: items.slice(0, MAX_ITEMS).map(({ time: _time, ...item }) => item),
  };
}
