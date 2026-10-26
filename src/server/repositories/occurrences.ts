import type { OccurrenceKind, Severity } from "../../shared/catalog.ts";
import type { Occurrence, OccurrenceStatus } from "../../shared/types.ts";
import type { Queryable } from "../db.ts";

type OccurrenceRow = {
  id: number;
  kind: string;
  severity: number;
  status: string;
  neighborhood_id: string;
  lat: number;
  lng: number;
  description: string;
  equipment_id: number | null;
  agent_id: number | null;
  created_at: number;
  resolved_at: number | null;
};

export type OccurrenceSource = "history" | "live" | "manual";

function toOccurrence(row: OccurrenceRow): Occurrence {
  return {
    id: row.id,
    kind: row.kind as OccurrenceKind,
    severity: row.severity as Severity,
    status: row.status as OccurrenceStatus,
    neighborhoodId: row.neighborhood_id,
    lat: row.lat,
    lng: row.lng,
    description: row.description,
    equipmentId: row.equipment_id,
    agentId: row.agent_id,
    createdAt: new Date(row.created_at).toISOString(),
    resolvedAt: row.resolved_at === null ? null : new Date(row.resolved_at).toISOString(),
  };
}

export type NewOccurrence = {
  cityId: number;
  kind: OccurrenceKind;
  severity: Severity;
  neighborhoodId: string;
  lat: number;
  lng: number;
  description: string;
  equipmentId: number | null;
  source: OccurrenceSource;
  createdAt: number;
};

export async function insertOccurrence(
  db: Queryable,
  occurrence: NewOccurrence,
): Promise<Occurrence> {
  const row = await db.one<OccurrenceRow>(
    `INSERT INTO occurrences (city_id, kind, severity, status, source, neighborhood_id, lat, lng,
     description, equipment_id, created_at) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      occurrence.cityId,
      occurrence.kind,
      occurrence.severity,
      occurrence.source,
      occurrence.neighborhoodId,
      occurrence.lat,
      occurrence.lng,
      occurrence.description,
      occurrence.equipmentId,
      occurrence.createdAt,
    ],
  );
  return toOccurrence(row!);
}

export async function getOccurrence(
  db: Queryable,
  cityId: number,
  id: number,
): Promise<Occurrence | null> {
  const row = await db.one<OccurrenceRow>(
    "SELECT * FROM occurrences WHERE id = $1 AND city_id = $2",
    [id, cityId],
  );
  return row ? toOccurrence(row) : null;
}

export async function listActiveOccurrences(db: Queryable, cityId: number): Promise<Occurrence[]> {
  const rows = await db.query<OccurrenceRow>(
    "SELECT * FROM occurrences WHERE city_id = $1 AND status <> 'resolved' ORDER BY created_at DESC, id DESC",
    [cityId],
  );
  return rows.map(toOccurrence);
}

export async function listRecentOccurrences(
  db: Queryable,
  cityId: number,
  since: number,
  limit: number,
): Promise<Occurrence[]> {
  const rows = await db.query<OccurrenceRow>(
    "SELECT * FROM occurrences WHERE city_id = $1 AND created_at >= $2 ORDER BY created_at DESC, id DESC LIMIT $3",
    [cityId, since, limit],
  );
  return rows.map(toOccurrence);
}

export async function assignOccurrence(db: Queryable, id: number, agentId: number): Promise<void> {
  await db.run("UPDATE occurrences SET status = 'responding', agent_id = $1 WHERE id = $2", [
    agentId,
    id,
  ]);
}

export async function resolveOccurrence(db: Queryable, id: number, at: number): Promise<void> {
  await db.run("UPDATE occurrences SET status = 'resolved', resolved_at = $1 WHERE id = $2", [
    at,
    id,
  ]);
}
