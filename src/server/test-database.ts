import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite, types, type Transaction } from "@electric-sql/pglite";
import { inject } from "vitest";
import type { CityDataset } from "../shared/types.ts";
import { loadCity } from "./city.ts";
import { migrate, queryable, type Database, type Executor } from "./db.ts";
import { importCity, seedDatabase } from "./seed/index.ts";
import { SEED_AGENCIES } from "./seed/inventory.ts";
import { MARILIA_IBGE_CODE, marilia } from "./seed/marilia.ts";
import { NOW } from "./test-fixtures.ts";

const PARSERS = { [types.INT8]: Number, [types.NUMERIC]: Number };

function executor(target: PGlite | Transaction): Executor {
  return {
    query: async (sql, params) => {
      const result = await target.query(sql, params);
      return { rows: result.rows, count: result.affectedRows ?? 0 };
    },
    exec: async (sql) => {
      await target.exec(sql);
    },
  };
}

function wrap(lite: PGlite): Database {
  return {
    ...queryable(executor(lite)),
    transaction: (work) => lite.transaction((tx) => work(queryable(executor(tx)))),
    close: () => lite.close(),
  };
}

const TEMPLATES = {
  empty: async () => {},
  city: async (db: Database) => {
    await importCity(db, marilia, NOW);
  },
  seeded: async (db: Database) => {
    await seedDatabase(db, marilia, { now: NOW, seed: 11, historyDays: 30, readingDays: 2 });
  },
  telemetry: async (db: Database) => {
    await seedDatabase(db, marilia, { now: NOW, seed: 4, historyDays: 30, readingDays: 10 });
  },
} satisfies Record<string, (db: Database) => Promise<void>>;

export type TemplateName = keyof typeof TEMPLATES;

export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

export async function buildTemplate(name: TemplateName): Promise<Blob> {
  const lite = new PGlite({ parsers: PARSERS });
  const db = wrap(lite);
  await migrate(db);
  await TEMPLATES[name](db);
  const blob = await lite.dumpDataDir("none");
  await lite.close();
  return blob;
}

const templates = new Map<TemplateName, Promise<Blob>>();

async function templateFile(name: TemplateName): Promise<Blob | null> {
  const dir = inject("templateDir");
  if (!dir) {
    return null;
  }
  return new Blob([await readFile(join(dir, `${name}.tar`))]);
}

async function fromTemplate(name: TemplateName): Promise<Database> {
  let dump = templates.get(name);
  if (!dump) {
    dump = templateFile(name).then((file) => file ?? buildTemplate(name));
    templates.set(name, dump);
  }
  return wrap(new PGlite({ parsers: PARSERS, loadDataDir: await dump }));
}

export function emptyDatabase(): Promise<Database> {
  return fromTemplate("empty");
}

export async function cityDatabase(): Promise<{ db: Database; city: CityDataset }> {
  const db = await fromTemplate("city");
  return { db, city: (await loadCity(db, 1))! };
}

export async function seededDatabase(
  name: "seeded" | "telemetry" = "seeded",
): Promise<{ db: Database; city: CityDataset }> {
  const db = await fromTemplate(name);
  return { db, city: (await loadCity(db, 1))! };
}

export function mariliaCity(): CityDataset {
  const source = structuredClone(marilia);
  return {
    city: {
      id: 1,
      name: source.city.name,
      uf: source.city.uf,
      ibgeCode: MARILIA_IBGE_CODE,
      center: source.city.center,
      boundary: source.city.boundary,
      simulated: true,
    },
    regions: source.regions.map(({ id, name }) => ({ id, name })),
    neighborhoods: source.neighborhoods,
    streets: source.streets,
    pois: source.pois,
    agencies: Object.values(SEED_AGENCIES).map((name, index) => ({ id: index + 1, name })),
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    templateDir: string;
  }
}
