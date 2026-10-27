import type { Queryable } from "./db.ts";

export type AuditEntry = {
  at: number;
  userId: number;
  username: string;
  cityId: number | null;
  method: string;
  path: string;
  status: number;
};

export type AuditRecord = {
  id: number;
  at: string;
  username: string;
  cityId: number | null;
  method: string;
  path: string;
  status: number;
};

type AuditRow = Omit<AuditRecord, "at" | "cityId"> & { at: number; city_id: number | null };

const AUDIT_PAGE_SIZE = 100;

export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.run(
    `INSERT INTO audit_log (at, user_id, username, city_id, method, path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entry.at, entry.userId, entry.username, entry.cityId, entry.method, entry.path, entry.status],
  );
}

export async function listAudit(
  db: Queryable,
  options: { cityId: number | null; before: number | null },
): Promise<AuditRecord[]> {
  const rows = await db.query<AuditRow>(
    `SELECT id, at, username, city_id, method, path, status FROM audit_log
     WHERE ($1::int IS NULL OR city_id = $1) AND ($2::bigint IS NULL OR id < $2)
     ORDER BY id DESC LIMIT $3`,
    [options.cityId, options.before, AUDIT_PAGE_SIZE],
  );
  return rows.map((row) => ({
    id: row.id,
    at: new Date(row.at).toISOString(),
    username: row.username,
    cityId: row.city_id,
    method: row.method,
    path: row.path,
    status: row.status,
  }));
}
