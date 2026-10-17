import type { OccurrenceKind, Severity } from "../../shared/catalog.ts";
import type { Occurrence, OccurrenceStatus } from "../../shared/types.ts";
import type { Database } from "../db.ts";

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

export function insertOccurrence(db: Database, occurrence: NewOccurrence): Occurrence {
  const result = db
    .prepare(
      `INSERT INTO occurrences (kind, severity, status, source, neighborhood_id, lat, lng, description,
       equipment_id, created_at) VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      occurrence.kind,
      occurrence.severity,
      occurrence.source,
      occurrence.neighborhoodId,
      occurrence.lat,
      occurrence.lng,
      occurrence.description,
      occurrence.equipmentId,
      occurrence.createdAt,
    );
  return getOccurrence(db, Number(result.lastInsertRowid))!;
}

export function getOccurrence(db: Database, id: number): Occurrence | null {
  const row = db.prepare("SELECT * FROM occurrences WHERE id = ?").get(id) as
    | OccurrenceRow
    | undefined;
  return row ? toOccurrence(row) : null;
}

export function listActiveOccurrences(db: Database): Occurrence[] {
  const rows = db
    .prepare("SELECT * FROM occurrences WHERE status != 'resolved' ORDER BY created_at DESC")
    .all() as OccurrenceRow[];
  return rows.map(toOccurrence);
}

export function listRecentOccurrences(db: Database, since: number, limit: number): Occurrence[] {
  const rows = db
    .prepare("SELECT * FROM occurrences WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?")
    .all(since, limit) as OccurrenceRow[];
  return rows.map(toOccurrence);
}

export function assignOccurrence(db: Database, id: number, agentId: number): void {
  db.prepare("UPDATE occurrences SET status = 'responding', agent_id = ? WHERE id = ?").run(
    agentId,
    id,
  );
}

export function resolveOccurrence(db: Database, id: number, at: number): void {
  db.prepare("UPDATE occurrences SET status = 'resolved', resolved_at = ? WHERE id = ?").run(
    at,
    id,
  );
}

export type OccurrenceCountRow = {
  neighborhood_id: string;
  kind: string;
  created_at: number;
  source: string;
};

export function occurrencesBetween(db: Database, from: number, to: number): OccurrenceCountRow[] {
  return db
    .prepare(
      "SELECT neighborhood_id, kind, created_at, source FROM occurrences WHERE created_at >= ? AND created_at < ?",
    )
    .all(from, to) as OccurrenceCountRow[];
}
