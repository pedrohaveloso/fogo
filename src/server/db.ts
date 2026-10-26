import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  serial_number TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  agency TEXT NOT NULL,
  status TEXT NOT NULL,
  cep TEXT NOT NULL,
  street TEXT NOT NULL,
  reference TEXT NOT NULL,
  neighborhood_id TEXT NOT NULL,
  city TEXT NOT NULL,
  uf TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  current_lat REAL,
  current_lng REAL,
  maintenance_need TEXT NOT NULL,
  maintenance_interval_days INTEGER,
  last_maintenance_at TEXT,
  next_maintenance_at TEXT,
  maintenance_notes TEXT NOT NULL DEFAULT '',
  attributes TEXT NOT NULL DEFAULT '{}',
  installed_at TEXT,
  last_seen_at INTEGER,
  battery REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS equipment_neighborhood ON equipment (neighborhood_id);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  badge TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  agency TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  shift TEXT NOT NULL,
  status TEXT NOT NULL,
  base_name TEXT NOT NULL,
  base_neighborhood_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  vehicle_id INTEGER REFERENCES equipment (id) ON DELETE SET NULL,
  occurrence_id INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  severity INTEGER NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  neighborhood_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  description TEXT NOT NULL,
  equipment_id INTEGER REFERENCES equipment (id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS occurrences_created ON occurrences (created_at);
CREATE INDEX IF NOT EXISTS occurrences_status ON occurrences (status);

CREATE TABLE IF NOT EXISTS equipment_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS status_events_equipment ON equipment_status_events (equipment_id, at);

CREATE TABLE IF NOT EXISTS maintenance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_events_equipment ON maintenance_events (equipment_id, at);

CREATE TABLE IF NOT EXISTS readings (
  equipment_id INTEGER NOT NULL REFERENCES equipment (id) ON DELETE CASCADE,
  hour_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (equipment_id, hour_start)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS readings_hour ON readings (hour_start);

CREATE TABLE IF NOT EXISTS sim_flow_sites (
  equipment_id INTEGER PRIMARY KEY REFERENCES equipment (id) ON DELETE CASCADE,
  base_volume REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_hours (
  hour_start INTEGER PRIMARY KEY
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS neighborhood_shapes (
  neighborhood_id TEXT PRIMARY KEY,
  polygon TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_neighborhoods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  equipment_id INTEGER UNIQUE REFERENCES equipment (id) ON DELETE CASCADE,
  agent_id INTEGER UNIQUE REFERENCES agents (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_report_at INTEGER,
  CHECK ((equipment_id IS NULL) <> (agent_id IS NULL))
);

CREATE TABLE IF NOT EXISTS alert_acks (
  alert_id TEXT PRIMARY KEY,
  acknowledged_at INTEGER NOT NULL
);
`;

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  return db;
}

export function transaction<T>(db: Database, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSetting(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
