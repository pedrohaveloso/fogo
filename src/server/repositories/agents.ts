import type { AgentRole, AgentStatus, Shift } from "../../shared/catalog.ts";
import type { Agent, AgentInput } from "../../shared/types.ts";
import { isUniqueViolation, named, type Queryable } from "../db.ts";

type AgentRow = {
  id: number;
  name: string;
  badge: string;
  city_id: number;
  role: string;
  agency_id: number;
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
    cityId: row.city_id,
    name: row.name,
    badge: row.badge,
    role: row.role as AgentRole,
    agencyId: row.agency_id,
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
    agency_id: input.agencyId,
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
  if (isUniqueViolation(error)) {
    throw new BadgeTakenError(badge);
  }
  throw error;
}

export async function listAgents(db: Queryable, cityId: number): Promise<Agent[]> {
  const rows = await db.query<AgentRow>("SELECT * FROM agents WHERE city_id = $1 ORDER BY name", [
    cityId,
  ]);
  return rows.map(toAgent);
}

export async function getAgent(db: Queryable, id: number): Promise<Agent | null> {
  const row = await db.one<AgentRow>("SELECT * FROM agents WHERE id = $1", [id]);
  return row ? toAgent(row) : null;
}

export async function createAgent(
  db: Queryable,
  cityId: number,
  input: AgentInput,
  now: number,
): Promise<Agent> {
  try {
    const row = await db.one<{ id: number }>(
      ...named(
        `INSERT INTO agents (city_id, name, badge, role, agency_id, rank, phone, shift, status, base_name,
         base_neighborhood_id, lat, lng, vehicle_id, last_seen_at, created_at, updated_at)
         VALUES (:city_id, :name, :badge, :role, :agency_id, :rank, :phone, :shift, :status, :base_name,
         :base_neighborhood_id, :lat, :lng, :vehicle_id, :now, :now, :now) RETURNING id`,
        { ...inputParams(input), city_id: cityId, now },
      ),
    );
    return (await getAgent(db, row!.id))!;
  } catch (error) {
    rethrowBadge(error, input.badge);
  }
}

async function releaseOccurrence(db: Queryable, agentId: number): Promise<void> {
  await db.run(
    "UPDATE occurrences SET status = 'open', agent_id = NULL WHERE agent_id = $1 AND status = 'responding'",
    [agentId],
  );
}

export async function updateAgent(
  db: Queryable,
  id: number,
  input: AgentInput,
  now: number,
): Promise<Agent | null> {
  if (input.status !== "responding") {
    await releaseOccurrence(db, id);
  }
  try {
    const changed = await db.run(
      ...named(
        `UPDATE agents SET name = :name, badge = :badge, role = :role, agency_id = :agency_id, rank = :rank,
         phone = :phone, shift = :shift, status = :status, base_name = :base_name,
         base_neighborhood_id = :base_neighborhood_id, lat = :lat, lng = :lng, vehicle_id = :vehicle_id,
         occurrence_id = CASE WHEN :status = 'responding' THEN occurrence_id ELSE NULL END,
         updated_at = :now WHERE id = :id`,
        { ...inputParams(input), now, id },
      ),
    );
    if (changed === 0) {
      return null;
    }
  } catch (error) {
    rethrowBadge(error, input.badge);
  }
  return getAgent(db, id);
}

export async function deleteAgent(db: Queryable, id: number): Promise<boolean> {
  await releaseOccurrence(db, id);
  return (await db.run("DELETE FROM agents WHERE id = $1", [id])) > 0;
}
