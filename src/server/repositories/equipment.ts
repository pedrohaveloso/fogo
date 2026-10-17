import type { SQLInputValue } from "node:sqlite";
import type {
  Agency,
  EquipmentStatus,
  EquipmentType,
  MaintenanceNeed,
} from "../../shared/catalog.ts";
import type { AttributeValue, Equipment, EquipmentInput } from "../../shared/types.ts";
import type { Database } from "../db.ts";

type EquipmentRow = {
  id: number;
  type: string;
  serial_number: string;
  brand: string;
  model: string;
  agency: string;
  status: string;
  cep: string;
  street: string;
  reference: string;
  neighborhood_id: string;
  city: string;
  uf: string;
  lat: number;
  lng: number;
  current_lat: number | null;
  current_lng: number | null;
  maintenance_need: string;
  maintenance_interval_days: number | null;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  maintenance_notes: string;
  attributes: string;
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
    agency: row.agency as Agency,
    status: row.status as EquipmentStatus,
    cep: row.cep,
    street: row.street,
    reference: row.reference,
    neighborhoodId: row.neighborhood_id,
    city: row.city,
    uf: row.uf,
    lat: row.lat,
    lng: row.lng,
    currentLat: row.current_lat,
    currentLng: row.current_lng,
    maintenanceNeed: row.maintenance_need as MaintenanceNeed,
    maintenanceIntervalDays: row.maintenance_interval_days,
    lastMaintenanceAt: row.last_maintenance_at,
    nextMaintenanceAt: row.next_maintenance_at,
    maintenanceNotes: row.maintenance_notes,
    attributes: JSON.parse(row.attributes) as Record<string, AttributeValue>,
    installedAt: row.installed_at,
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    battery: row.battery,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function inputParams(input: EquipmentInput): Record<string, SQLInputValue> {
  return {
    type: input.type,
    serial_number: input.serialNumber,
    brand: input.brand,
    model: input.model,
    agency: input.agency,
    status: input.status,
    cep: input.cep,
    street: input.street,
    reference: input.reference,
    neighborhood_id: input.neighborhoodId,
    city: input.city,
    uf: input.uf,
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
  "agency",
  "status",
  "cep",
  "street",
  "reference",
  "neighborhood_id",
  "city",
  "uf",
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function listEquipment(db: Database): Equipment[] {
  const rows = db.prepare("SELECT * FROM equipment ORDER BY id").all() as EquipmentRow[];
  return rows.map(toEquipment);
}

export function getEquipment(db: Database, id: number): Equipment | null {
  const row = db.prepare("SELECT * FROM equipment WHERE id = ?").get(id) as
    | EquipmentRow
    | undefined;
  return row ? toEquipment(row) : null;
}

export function createEquipment(db: Database, input: EquipmentInput, now: number): Equipment {
  const params = inputParams(input);
  const isMobileStart = input.status === "operational";
  try {
    const result = db
      .prepare(
        `INSERT INTO equipment (${COLUMNS.join(", ")}, current_lat, current_lng, last_seen_at, created_at, updated_at)
         VALUES (${COLUMNS.map((column) => `:${column}`).join(", ")}, :lat, :lng, :last_seen_at, :now, :now)`,
      )
      .run({ ...params, last_seen_at: isMobileStart ? now : null, now });
    const id = Number(result.lastInsertRowid);
    recordStatusEvent(db, id, input.status, "Cadastro", now);
    return getEquipment(db, id)!;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SerialNumberTakenError(input.serialNumber);
    }
    throw error;
  }
}

export function updateEquipment(
  db: Database,
  id: number,
  input: EquipmentInput,
  now: number,
): Equipment | null {
  const previous = getEquipment(db, id);
  if (!previous) {
    return null;
  }
  const locationChanged = previous.lat !== input.lat || previous.lng !== input.lng;
  try {
    db.prepare(
      `UPDATE equipment SET ${COLUMNS.map((column) => `${column} = :${column}`).join(", ")},
       current_lat = CASE WHEN :location_changed THEN :lat ELSE current_lat END,
       current_lng = CASE WHEN :location_changed THEN :lng ELSE current_lng END,
       updated_at = :now WHERE id = :id`,
    ).run({ ...inputParams(input), location_changed: locationChanged ? 1 : 0, now, id });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SerialNumberTakenError(input.serialNumber);
    }
    throw error;
  }
  if (previous.status !== input.status) {
    recordStatusEvent(db, id, input.status, "Alteração manual", now);
  }
  return getEquipment(db, id);
}

export function deleteEquipment(db: Database, id: number): boolean {
  return Number(db.prepare("DELETE FROM equipment WHERE id = ?").run(id).changes) > 0;
}

export function setEquipmentStatus(
  db: Database,
  id: number,
  status: EquipmentStatus,
  reason: string,
  now: number,
  maintenanceNeed?: MaintenanceNeed,
): void {
  db.prepare(
    `UPDATE equipment SET status = :status, updated_at = :now,
     maintenance_need = COALESCE(:need, maintenance_need) WHERE id = :id`,
  ).run({ status, now, id, need: maintenanceNeed ?? null });
  recordStatusEvent(db, id, status, reason, now);
}

export function recordStatusEvent(
  db: Database,
  id: number,
  status: EquipmentStatus,
  reason: string,
  at: number,
): void {
  db.prepare(
    "INSERT INTO equipment_status_events (equipment_id, status, reason, at) VALUES (?, ?, ?, ?)",
  ).run(id, status, reason, at);
}

export function completeMaintenance(
  db: Database,
  id: number,
  date: string,
  nextDate: string | null,
  now: number,
): void {
  db.prepare(
    `UPDATE equipment SET last_maintenance_at = :date, next_maintenance_at = :next,
     maintenance_need = CASE WHEN :next IS NULL THEN 'none' ELSE 'scheduled' END, updated_at = :now
     WHERE id = :id`,
  ).run({ date, next: nextDate, now, id });
  db.prepare(
    "INSERT INTO maintenance_events (equipment_id, kind, at) VALUES (?, 'preventive', ?)",
  ).run(id, now);
}

export function statusHistory(
  db: Database,
  id: number,
  limit: number,
): { status: EquipmentStatus; reason: string; at: string }[] {
  const rows = db
    .prepare(
      "SELECT status, reason, at FROM equipment_status_events WHERE equipment_id = ? ORDER BY at DESC LIMIT ?",
    )
    .all(id, limit) as { status: string; reason: string; at: number }[];
  return rows.map((row) => ({
    status: row.status as EquipmentStatus,
    reason: row.reason,
    at: new Date(row.at).toISOString(),
  }));
}

export function readingsSince(
  db: Database,
  id: number,
  since: number,
): { hourStart: string; count: number }[] {
  const rows = db
    .prepare(
      "SELECT hour_start, count FROM readings WHERE equipment_id = ? AND hour_start >= ? ORDER BY hour_start",
    )
    .all(id, since) as { hour_start: number; count: number }[];
  return rows.map((row) => ({
    hourStart: new Date(row.hour_start).toISOString(),
    count: row.count,
  }));
}
