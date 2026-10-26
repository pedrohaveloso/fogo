import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { deleteExpiredSessions } from "./auth.ts";
import { createCityRegistry } from "./cities.ts";
import {
  ConfigError,
  describeDatabase,
  readConfig,
  storedModeProblem,
  type Config,
} from "./config.ts";
import { getSetting, migrate, openDatabase, setSetting, type Database } from "./db.ts";
import { createDemandModel } from "./patterns.ts";
import { ensureRootUser, ROOT_USERNAME } from "./repositories/users.ts";
import { isDatabaseEmpty, seedDatabase } from "./seed/index.ts";
import { loadMariliaRoads, marilia } from "./seed/marilia.ts";
import { createSimulator } from "./simulator.ts";

const webRoot = "dist/web";
const HEARTBEAT_MS = 5000;
const CONNECT_ATTEMPTS = 15;
const CONNECT_DELAY_MS = 2000;

let config: Config;
try {
  config = readConfig(process.argv, process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
const { mode, port, databaseUrl, liveMultiplier, seed, rootPassword } = config;
const databaseLabel = describeDatabase(databaseUrl);

async function connect(): Promise<Database> {
  const db = openDatabase(databaseUrl);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await db.one("SELECT 1");
      return db;
    } catch (error) {
      if (attempt >= CONNECT_ATTEMPTS) {
        console.error(
          `Não foi possível conectar ao PostgreSQL em ${databaseLabel}. Suba o banco com "docker compose up -d db" ou ajuste DATABASE_URL.`,
        );
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_DELAY_MS));
    }
  }
}

const db = await connect();

if (config.reset) {
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}
await migrate(db);

const storedMode =
  (await getSetting(db, "mode")) ?? ((await getSetting(db, "seeded_at")) ? "simulation" : null);
const modeProblem = storedModeProblem(storedMode, mode);
if (modeProblem) {
  console.error(`${modeProblem} Banco: ${databaseLabel}`);
  await db.close();
  process.exit(1);
}
await setSetting(db, "mode", mode);

if (mode === "simulation" && (await isDatabaseEmpty(db))) {
  console.log("Banco vazio: gerando inventário e 120 dias de histórico de Marília...");
  const summary = await seedDatabase(db, marilia, {
    now: Date.now(),
    seed,
    historyDays: 120,
    readingDays: 35,
  });
  console.log(
    `Pronto: ${summary.equipment} equipamentos, ${summary.agents} agentes, ${summary.occurrences} ocorrências e ${summary.readings} leituras de telemetria.`,
  );
}

if (mode === "production" && (await ensureRootUser(db, rootPassword, Date.now()))) {
  console.log(
    process.env["FOGO_ROOT_PASSWORD"]
      ? `Usuário ${ROOT_USERNAME} criado com a senha de FOGO_ROOT_PASSWORD.`
      : `Usuário ${ROOT_USERNAME} criado com a senha padrão "root". Troque a senha depois de entrar.`,
  );
}
await deleteExpiredSessions(db, Date.now());

const cities = await createCityRegistry(db, { liveMultiplier });
const app = createApp({ db, cities, mode, now: Date.now, fetchImpl: fetch });

if (existsSync(webRoot)) {
  const assets = serveStatic({ root: webRoot });
  const page = serveStatic({ path: `${webRoot}/index.html` });
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : assets(c, next)));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : page(c, next)));
}

const seededAt = Number((await getSetting(db, "seeded_at")) ?? Date.now());
const simulated =
  mode === "simulation" ? cities.all().find((item) => item.city.city.simulated) : undefined;
const simulator = simulated
  ? createSimulator(
      db,
      simulated.city,
      loadMariliaRoads(),
      simulated.hub,
      createDemandModel(simulated.city, seededAt),
      { liveMultiplier, tickMs: 2000, seed: seed ^ Date.now(), seededAt },
    )
  : null;
await simulator?.start();
const heartbeat = setInterval(() => {
  for (const context of cities.all()) {
    if (context !== simulated) {
      context.hub.publish({}, Date.now()).catch((error: unknown) => console.error(error));
    }
  }
}, HEARTBEAT_MS);

const server = serve({ fetch: app.fetch, port }, (info) => {
  const label = mode === "simulation" ? "modo simulação" : "modo produção";
  console.log(`FOGO rodando em http://localhost:${info.port} (${label}, banco ${databaseLabel})`);
  if (!existsSync(webRoot)) {
    console.log("Interface não compilada: rode `pnpm build` ou use `pnpm dev`.");
  }
});

function shutdown(): void {
  simulator?.stop();
  clearInterval(heartbeat);
  server.close();
  void db.close().finally(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
