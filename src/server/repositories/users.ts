import type { User, UserRole } from "../../shared/types.ts";
import { hashPassword } from "../auth.ts";
import { isUniqueViolation, type Database, type Queryable } from "../db.ts";
import type { UserInput } from "../validation.ts";

type UserRow = {
  id: number;
  username: string;
  name: string;
  password_hash: string;
  role: string;
  city_id: number | null;
  created_at: number;
  updated_at: number;
};

export class UsernameTakenError extends Error {}

export class LastAdminError extends Error {}

export const ROOT_USERNAME = "root";

export async function accessibleCityIds(db: Queryable, userId: number): Promise<number[]> {
  const rows = await db.query<{ city_id: number }>(
    "SELECT city_id FROM user_cities WHERE user_id = $1 ORDER BY city_id",
    [userId],
  );
  return rows.map((row) => row.city_id);
}

async function toUser(db: Queryable, row: UserRow): Promise<User> {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role as UserRole,
    cityIds: await accessibleCityIds(db, row.id),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listUsers(db: Queryable): Promise<User[]> {
  const rows = await db.query<UserRow>("SELECT * FROM users ORDER BY name");
  return Promise.all(rows.map((row) => toUser(db, row)));
}

export async function getUser(db: Queryable, id: number): Promise<User | null> {
  const row = await db.one<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
  return row ? toUser(db, row) : null;
}

export async function credentialsOf(
  db: Queryable,
  username: string,
): Promise<{ id: number; passwordHash: string } | null> {
  const row = await db.one<Pick<UserRow, "id" | "password_hash">>(
    "SELECT id, password_hash FROM users WHERE lower(username) = lower($1)",
    [username],
  );
  return row ? { id: row.id, passwordHash: row.password_hash } : null;
}

export async function passwordHashOf(db: Queryable, id: number): Promise<string | null> {
  const row = await db.one<Pick<UserRow, "password_hash">>(
    "SELECT password_hash FROM users WHERE id = $1",
    [id],
  );
  return row?.password_hash ?? null;
}

export async function preferredCityId(db: Queryable, userId: number): Promise<number | null> {
  const row = await db.one<Pick<UserRow, "city_id">>("SELECT city_id FROM users WHERE id = $1", [
    userId,
  ]);
  return row?.city_id ?? null;
}

export async function setPreferredCity(
  db: Queryable,
  userId: number,
  cityId: number,
): Promise<void> {
  await db.run("UPDATE users SET city_id = $1 WHERE id = $2", [cityId, userId]);
}

async function writeCities(
  db: Queryable,
  userId: number,
  cityIds: readonly number[],
): Promise<void> {
  await db.run("DELETE FROM user_cities WHERE user_id = $1", [userId]);
  await db.run(
    "INSERT INTO user_cities (user_id, city_id) SELECT $1, id FROM cities WHERE id = ANY($2)",
    [userId, [...new Set(cityIds)]],
  );
}

async function adminCount(db: Queryable): Promise<number> {
  const row = await db.one<{ total: number }>(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'",
  );
  return row!.total;
}

function rethrowUsername(error: unknown, username: string): never {
  if (isUniqueViolation(error)) {
    throw new UsernameTakenError(username);
  }
  throw error;
}

export async function createUser(db: Database, input: UserInput, now: number): Promise<User> {
  const passwordHash = await hashPassword(input.password!);
  try {
    const id = await db.transaction(async (tx) => {
      const row = await tx.one<{ id: number }>(
        `INSERT INTO users (username, name, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
        [input.username, input.name, passwordHash, input.role, now],
      );
      await writeCities(tx, row!.id, input.cityIds);
      return row!.id;
    });
    return (await getUser(db, id))!;
  } catch (error) {
    rethrowUsername(error, input.username);
  }
}

export async function updateUser(
  db: Database,
  id: number,
  input: UserInput,
  now: number,
): Promise<User | null> {
  const current = await getUser(db, id);
  if (!current) {
    return null;
  }
  if (current.role === "admin" && input.role !== "admin" && (await adminCount(db)) <= 1) {
    throw new LastAdminError();
  }
  const passwordHash = input.password === null ? null : await hashPassword(input.password);
  try {
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE users SET username = $1, name = $2, role = $3, updated_at = $4,
         password_hash = COALESCE($5, password_hash) WHERE id = $6`,
        [input.username, input.name, input.role, now, passwordHash, id],
      );
      await writeCities(tx, id, input.cityIds);
      if (passwordHash !== null) {
        await tx.run("DELETE FROM sessions WHERE user_id = $1", [id]);
      }
    });
  } catch (error) {
    rethrowUsername(error, input.username);
  }
  return getUser(db, id);
}

export async function deleteUser(db: Queryable, id: number): Promise<boolean> {
  const current = await getUser(db, id);
  if (!current) {
    return false;
  }
  if (current.role === "admin" && (await adminCount(db)) <= 1) {
    throw new LastAdminError();
  }
  return (await db.run("DELETE FROM users WHERE id = $1", [id])) > 0;
}

export async function setPassword(
  db: Queryable,
  id: number,
  password: string,
  now: number,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db.run("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [
    passwordHash,
    now,
    id,
  ]);
}

export async function ensureRootUser(
  db: Database,
  password: string,
  now: number,
): Promise<boolean> {
  const row = await db.one<{ total: number }>("SELECT COUNT(*) AS total FROM users");
  if (row!.total > 0) {
    return false;
  }
  await createUser(
    db,
    { username: ROOT_USERNAME, name: "Administrador", role: "admin", cityIds: [], password },
    now,
  );
  return true;
}
