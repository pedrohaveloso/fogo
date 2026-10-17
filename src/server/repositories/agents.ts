import {
  AGENT_ROLES,
  type Agency,
  type AgentRole,
  type AgentStatus,
  type Shift,
} from "../../shared/catalog.ts";
import type { Agent, AgentInput } from "../../shared/types.ts";
import type { Database } from "../db.ts";

type AgentRow = {
  id: number;
  name: string;
  badge: string;
  role: string;
  agency: string;
  rank: string;
  phone: string;
  shift: string;
  status: string;
  base_name: string;
  base_neighborhood_id: string;
  lat: number;
  lng: number;
  vehicle_id: number | null;
  occurrence_id: number | null;
  last_seen_at: number | null;
  created_at: number;
  updated_at: number;
};

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    badge: row.badge,
    role: row.role as AgentRole,
    agency: row.agency as Agency,
    rank: row.rank,
    phone: row.phone,
    shift: row.shift as Shift,
    status: row.status as AgentStatus,
    baseName: row.base_name,
    baseNeighborhoodId: row.base_neighborhood_id,
    lat: row.lat,
    lng: row.lng,
    vehicleId: row.vehicle_id,
    occurrenceId: row.occurrence_id,
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class BadgeTakenError extends Error {}

function inputParams(input: AgentInput) {
  return {
    name: input.name,
    badge: input.badge,
    role: input.role,
    agency: AGENT_ROLES[input.role].agency,
    rank: input.rank,
    phone: input.phone,
    shift: input.shift,
    status: input.status,
    base_name: input.baseName,
    base_neighborhood_id: input.baseNeighborhoodId,
    lat: input.lat,
    lng: input.lng,
    vehicle_id: input.vehicleId,
  };
}

function rethrowBadge(error: unknown, badge: string): never {
  if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
    throw new BadgeTakenError(badge);
  }
  throw error;
}

export function listAgents(db: Database): Agent[] {
  return (db.prepare("SELECT * FROM agents ORDER BY name").all() as AgentRow[]).map(toAgent);
}

export function getAgent(db: Database, id: number): Agent | null {
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  return row ? toAgent(row) : null;
}

export function createAgent(db: Database, input: AgentInput, now: number): Agent {
  try {
    const result = db
      .prepare(
        `INSERT INTO agents (name, badge, role, agency, rank, phone, shift, status, base_name,
         base_neighborhood_id, lat, lng, vehicle_id, last_seen_at, created_at, updated_at)
         VALUES (:name, :badge, :role, :agency, :rank, :phone, :shift, :status, :base_name,
         :base_neighborhood_id, :lat, :lng, :vehicle_id, :now, :now, :now)`,
      )
      .run({ ...inputParams(input), now });
    return getAgent(db, Number(result.lastInsertRowid))!;
  } catch (error) {
    rethrowBadge(error, input.badge);
  }
}

function releaseOccurrence(db: Database, agentId: number): void {
  db.prepare(
    "UPDATE occurrences SET status = 'open', agent_id = NULL WHERE agent_id = ? AND status = 'responding'",
  ).run(agentId);
}

export function updateAgent(
  db: Database,
  id: number,
  input: AgentInput,
  now: number,
): Agent | null {
  if (input.status !== "responding") {
    releaseOccurrence(db, id);
  }
  try {
    const result = db
      .prepare(
        `UPDATE agents SET name = :name, badge = :badge, role = :role, agency = :agency, rank = :rank,
         phone = :phone, shift = :shift, status = :status, base_name = :base_name,
         base_neighborhood_id = :base_neighborhood_id, lat = :lat, lng = :lng, vehicle_id = :vehicle_id,
         occurrence_id = CASE WHEN :status = 'responding' THEN occurrence_id ELSE NULL END,
         updated_at = :now WHERE id = :id`,
      )
      .run({ ...inputParams(input), now, id });
    if (Number(result.changes) === 0) {
      return null;
    }
  } catch (error) {
    rethrowBadge(error, input.badge);
  }
  return getAgent(db, id);
}

export function deleteAgent(db: Database, id: number): boolean {
  releaseOccurrence(db, id);
  return Number(db.prepare("DELETE FROM agents WHERE id = ?").run(id).changes) > 0;
}
