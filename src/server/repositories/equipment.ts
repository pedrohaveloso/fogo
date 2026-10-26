import type { EquipmentStatus, EquipmentType, MaintenanceNeed } from "../../shared/catalog.ts";
import type { AttributeValue, Equipment, EquipmentInput } from "../../shared/types.ts";
import { isUniqueViolation, type Queryable } from "../db.ts";

type EquipmentRow = {
  id: number;
  type: string;
  serial_number: string;
  brand: string;
  model: string;
  agency_id: number;
  status: string;
  cep: string;
  street: string;
  reference: string;
  neighborhood_id: string;
  city_id: number;
  lat: number;
  lng: number;
  current_lat: number | null;
  current_lng: number | null;
  maintenance_need: string;
  maintenance_interval_days: number | null;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  maintenance_notes: string;
  attributes: Record<string, AttributeValue>;
  installed_at: string | null;
  last_seen_at: number | null;
  battery: number | null;
  created_at: number;
  updated_at: number;
};

function toEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    type: row.type as EquipmentType,
    serialNumber: row.serial_number,
    brand: row.brand,
    model: row.model,
    agencyId: row.agency_id,
    status: row.status as EquipmentStatus,
    cep: row.cep,
    street: row.street,
    reference: row.reference,
    neighborhoodId: row.neighborhood_id,
    cityId: row.city_id,
    lat: row.lat,
    lng: row.lng,
    currentLat: row.current_lat,
    currentLng: row.current_lng,
    maintenanceNeed: row.maintenance_need as MaintenanceNeed,
    maintenanceIntervalDays: row.maintenance_interval_days,
    lastMaintenanceAt: row.last_maintenance_at,
    nextMaintenanceAt: row.next_maintenance_at,
    maintenanceNotes: row.maintenance_notes,
    attributes: row.attributes,
    installedAt: row.installed_at,
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    battery: row.battery,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function inputParams(input: EquipmentInput): Record<string, unknown> {
  return {
    type: input.type,
    serial_number: input.serialNumber,
    brand: input.brand,
    model: input.model,
    agency_id: input.agencyId,
    status: input.status,
    cep: input.cep,
    street: input.street,
    reference: input.reference,
    neighborhood_id: input.neighborhoodId,
    city_id: input.cityId,
    lat: input.lat,
    lng: input.lng,
    maintenance_need: input.maintenanceNeed,
    maintenance_interval_days: input.maintenanceIntervalDays,
    last_maintenance_at: input.lastMaintenanceAt,
    next_maintenance_at: input.nextMaintenanceAt,
    maintenance_notes: input.maintenanceNotes,
    attributes: JSON.stringify(input.attributes),
    installed_at: input.installedAt,
  };
}

const COLUMNS = [
  "type",
  "serial_number",
  "brand",
  "model",
  "agency_id",
  "status",
  "cep",
  "street",
  "reference",
  "neighborhood_id",
  "city_id",
  "lat",
  "lng",
  "maintenance_need",
  "maintenance_interval_days",
  "last_maintenance_at",
  "next_maintenance_at",
  "maintenance_notes",
  "attributes",
  "installed_at",
];

export class SerialNumberTakenError extends Error {}

function values(input: EquipmentInput): unknown[] {
  const params = inputParams(input);
  return COLUMNS.map((column) => params[column]);
}

export async function listEquipment(db: Queryable, cityId: number): Promise<Equipment[]> {
  const rows = await db.query<EquipmentRow>(
    "SELECT * FROM equipment WHERE city_id = $1 ORDER BY id",
    [cityId],
  );
  return rows.map(toEquipment);
}

export async function getEquipment(db: Queryable, id: number): Promise<Equipment | null> {
  const row = await db.one<EquipmentRow>("SELECT * FROM equipment WHERE id = $1", [id]);
  return row ? toEquipment(row) : null;
}

export async function createEquipment(
  db: Queryable,
  input: EquipmentInput,
  now: number,
): Promise<Equipment> {
  const isMobileStart = input.status === "operational";
  const count = COLUMNS.length;
  try {
    const row = await db.one<{ id: number }>(
      `INSERT INTO equipment (${COLUMNS.join(", ")}, current_lat, current_lng, last_seen_at, created_at, updated_at)
       VALUES (${COLUMNS.map((_, index) => `$${index + 1}`).join(", ")},
       $${COLUMNS.indexOf("lat") + 1}, $${COLUMNS.indexOf("lng") + 1}, $${count + 1}, $${count + 2}, $${count + 2})
       RETURNING id`,
      [...values(input), isMobileStart ? now : null, now],
    );
    await recordStatusEvent(db, row!.id, input.status, "Cadastro", now);
    return (await getEquipment(db, row!.id))!;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SerialNumberTakenError(input.serialNumber);
    }
    throw error;
  }
}

export async function updateEquipment(
  db: Queryable,
  id: number,
  input: EquipmentInput,
  now: number,
): Promise<Equipment | null> {
  const previous = await getEquipment(db, id);
  if (!previous) {
    return null;
  }
  const locationChanged = previous.lat !== input.lat || previous.lng !== input.lng;
  const count = COLUMNS.length;
  try {
    await db.run(
      `UPDATE equipment SET ${COLUMNS.map((column, index) => `${column} = $${index + 1}`).join(", ")},
       current_lat = CASE WHEN $${count + 1}::boolean THEN $${COLUMNS.indexOf("lat") + 1}::double precision ELSE current_lat END,
       current_lng = CASE WHEN $${count + 1}::boolean THEN $${COLUMNS.indexOf("lng") + 1}::double precision ELSE current_lng END,
       updated_at = $${count + 2} WHERE id = $${count + 3}`,
      [...values(input), locationChanged, now, id],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SerialNumberTakenError(input.serialNumber);
    }
    throw error;
  }
  if (previous.status !== input.status) {
    await recordStatusEvent(db, id, input.status, "Alteração manual", now);
  }
  return getEquipment(db, id);
}

export async function deleteEquipment(db: Queryable, id: number): Promise<boolean> {
  return (await db.run("DELETE FROM equipment WHERE id = $1", [id])) > 0;
}

export async function setEquipmentStatus(
  db: Queryable,
  id: number,
  status: EquipmentStatus,
  reason: string,
  now: number,
  maintenanceNeed?: MaintenanceNeed,
): Promise<void> {
  await db.run(
    `UPDATE equipment SET status = $1, updated_at = $2,
     maintenance_need = COALESCE($3, maintenance_need) WHERE id = $4`,
    [status, now, maintenanceNeed ?? null, id],
  );
  await recordStatusEvent(db, id, status, reason, now);
}

export async function recordStatusEvent(
  db: Queryable,
  id: number,
  status: EquipmentStatus,
  reason: string,
  at: number,
): Promise<void> {
  await db.run(
    "INSERT INTO equipment_status_events (equipment_id, status, reason, at) VALUES ($1, $2, $3, $4)",
    [id, status, reason, at],
  );
}

export async function completeMaintenance(
  db: Queryable,
  id: number,
  date: string,
  nextDate: string | null,
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE equipment SET last_maintenance_at = $1, next_maintenance_at = $2,
     maintenance_need = CASE WHEN $2::text IS NULL THEN 'none' ELSE 'scheduled' END, updated_at = $3
     WHERE id = $4`,
    [date, nextDate, now, id],
  );
  await db.run(
    "INSERT INTO maintenance_events (equipment_id, kind, at) VALUES ($1, 'preventive', $2)",
    [id, now],
  );
}

export async function statusHistory(
  db: Queryable,
  id: number,
  limit: number,
): Promise<{ status: EquipmentStatus; reason: string; at: string }[]> {
  const rows = await db.query<{ status: string; reason: string; at: number }>(
    "SELECT status, reason, at FROM equipment_status_events WHERE equipment_id = $1 ORDER BY at DESC, id DESC LIMIT $2",
    [id, limit],
  );
  return rows.map((row) => ({
    status: row.status as EquipmentStatus,
    reason: row.reason,
    at: new Date(row.at).toISOString(),
  }));
}

export async function readingsSince(
  db: Queryable,
  id: number,
  since: number,
): Promise<{ hourStart: string; count: number }[]> {
  const rows = await db.query<{ hour_start: number; count: number }>(
    "SELECT hour_start, count FROM readings WHERE equipment_id = $1 AND hour_start >= $2 ORDER BY hour_start",
    [id, since],
  );
  return rows.map((row) => ({
    hourStart: new Date(row.hour_start).toISOString(),
    count: row.count,
  }));
}
