import { readdir, readFile } from "node:fs/promises";
import { Pool, types, type PoolClient } from "pg";

export type Queryable = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  one<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  run(sql: string, params?: readonly unknown[]): Promise<number>;
  exec(sql: string): Promise<void>;
};

export type Database = Queryable & {
  transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export type Executor = {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; count: number }>;
  exec(sql: string): Promise<void>;
};

export function queryable(executor: Executor): Queryable {
  return {
    query: async <T>(sql: string, params: readonly unknown[] = []) =>
      (await executor.query(sql, [...params])).rows as T[],
    one: async <T>(sql: string, params: readonly unknown[] = []) =>
      (await executor.query(sql, [...params])).rows[0] as T | undefined,
    run: async (sql: string, params: readonly unknown[] = []) =>
      (await executor.query(sql, [...params])).count,
    exec: (sql: string) => executor.exec(sql),
  };
}

types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.NUMERIC, Number);

function clientExecutor(client: Pool | PoolClient): Executor {
  return {
    query: async (sql, params) => {
      const result = await client.query(sql, params);
      return { rows: result.rows, count: result.rowCount ?? 0 };
    },
    exec: async (sql) => {
      await client.query(sql);
    },
  };
}

export function openDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return {
    ...queryable(clientExecutor(pool)),
    async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(queryable(clientExecutor(client)));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

const MIGRATIONS = new URL("./migrations/", import.meta.url);

export async function migrate(db: Database): Promise<string[]> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)",
  );
  const applied = new Set(
    (await db.query<{ version: string }>("SELECT version FROM schema_migrations")).map(
      (row) => row.version,
    ),
  );
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  const pending = files.filter((name) => !applied.has(name));
  for (const name of pending) {
    const sql = await readFile(new URL(name, MIGRATIONS), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.run("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [
        name,
        Date.now(),
      ]);
    });
  }
  return pending;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505"
  );
}

export async function getSetting(db: Queryable, key: string): Promise<string | null> {
  const row = await db.one<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value ?? null;
}

export async function setSetting(db: Queryable, key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export async function insertMany(
  db: Queryable,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<void> {
  const perRow = columns.length;
  const chunk = Math.max(1, Math.floor(60_000 / perRow));
  for (let start = 0; start < rows.length; start += chunk) {
    const slice = rows.slice(start, start + chunk);
    const values = slice
      .map(
        (_, row) => `(${columns.map((__, column) => `$${row * perRow + column + 1}`).join(", ")})`,
      )
      .join(", ");
    await db.run(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values}`, slice.flat());
  }
}

export function named(sql: string, params: Record<string, unknown>): [string, unknown[]] {
  const order: string[] = [];
  const text = sql.replaceAll(/(?<!:):([a-z_]+)/g, (_, key: string) => {
    if (!order.includes(key)) {
      order.push(key);
    }
    return `$${order.indexOf(key) + 1}`;
  });
  return [text, order.map((key) => params[key])];
}
