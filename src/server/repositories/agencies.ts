import type { Agency } from "../../shared/types.ts";
import { isUniqueViolation, type Queryable } from "../db.ts";

export class AgencyNameTakenError extends Error {}

export class AgencyInUseError extends Error {}

export async function createAgency(
  db: Queryable,
  cityId: number,
  name: string,
  now: number,
): Promise<Agency> {
  try {
    const row = await db.one<{ id: number }>(
      "INSERT INTO agencies (city_id, name, created_at) VALUES ($1, $2, $3) RETURNING id",
      [cityId, name, now],
    );
    return { id: row!.id, name };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AgencyNameTakenError(name);
    }
    throw error;
  }
}

export async function renameAgency(
  db: Queryable,
  cityId: number,
  id: number,
  name: string,
): Promise<Agency | null> {
  try {
    const changed = await db.run("UPDATE agencies SET name = $1 WHERE id = $2 AND city_id = $3", [
      name,
      id,
      cityId,
    ]);
    return changed > 0 ? { id, name } : null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AgencyNameTakenError(name);
    }
    throw error;
  }
}

export async function deleteAgency(db: Queryable, cityId: number, id: number): Promise<boolean> {
  const { total } = (await db.one<{ total: number }>(
    `SELECT (SELECT COUNT(*) FROM equipment WHERE agency_id = $1)
      + (SELECT COUNT(*) FROM agents WHERE agency_id = $1) AS total`,
    [id],
  ))!;
  if (total > 0) {
    throw new AgencyInUseError();
  }
  return (await db.run("DELETE FROM agencies WHERE id = $1 AND city_id = $2", [id, cityId])) > 0;
}
