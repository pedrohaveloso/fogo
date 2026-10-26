import { existsSync, rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { city, roads } from "./city.ts";
import { ConfigError, readConfig, storedModeProblem, type Config } from "./config.ts";
import { getSetting, openDatabase, setSetting } from "./db.ts";
import { createLiveHub } from "./live.ts";
import { createNeighborhoodShapes } from "./neighborhoods.ts";
import { createDemandModel } from "./patterns.ts";
import { createPredictionService } from "./predictions/service.ts";
import { isDatabaseEmpty, seedDatabase } from "./seed/index.ts";
import { createSimulator } from "./simulator.ts";

const webRoot = "dist/web";
const HEARTBEAT_MS = 5000;

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
const { mode, port, databasePath, liveMultiplier, seed } = config;

if (config.reset) {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

const db = openDatabase(databasePath);
const storedMode = getSetting(db, "mode") ?? (getSetting(db, "seeded_at") ? "simulation" : null);
const modeProblem = storedModeProblem(storedMode, mode);
if (modeProblem) {
  console.error(`${modeProblem} Banco: ${databasePath}`);
  db.close();
  process.exit(1);
}
setSetting(db, "mode", mode);

if (mode === "simulation" && isDatabaseEmpty(db)) {
  console.log("Banco vazio: gerando inventário e 120 dias de histórico de Marília...");
  const summary = seedDatabase(db, city, {
    now: Date.now(),
    seed,
    historyDays: 120,
    readingDays: 35,
  });
  console.log(
    `Pronto: ${summary.equipment} equipamentos, ${summary.agents} agentes, ${summary.occurrences} ocorrências e ${summary.readings} leituras de telemetria.`,
  );
}

const shapes = createNeighborhoodShapes(db, city);
shapes.load(Date.now());

const predictions = createPredictionService(db, city, liveMultiplier);
const hub = createLiveHub(db, city, predictions);
const app = createApp({
  db,
  city,
  hub,
  shapes,
  predictions,
  mode,
  liveMultiplier,
  now: Date.now,
  fetchImpl: fetch,
});

if (existsSync(webRoot)) {
  const assets = serveStatic({ root: webRoot });
  const page = serveStatic({ path: `${webRoot}/index.html` });
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : assets(c, next)));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : page(c, next)));
}

const seededAt = Number(getSetting(db, "seeded_at") ?? Date.now());
const simulator =
  mode === "simulation"
    ? createSimulator(db, city, roads, hub, createDemandModel(city, seededAt), {
        liveMultiplier,
        tickMs: 2000,
        seed: seed ^ Date.now(),
        seededAt,
      })
    : null;
simulator?.start();
const heartbeat =
  mode === "production" ? setInterval(() => hub.publish({}, Date.now()), HEARTBEAT_MS) : null;

const server = serve({ fetch: app.fetch, port }, (info) => {
  const label = mode === "simulation" ? "modo simulação" : "modo produção";
  console.log(`FOGO rodando em http://localhost:${info.port} (${label}, banco ${databasePath})`);
  if (!existsSync(webRoot)) {
    console.log("Interface não compilada: rode `pnpm build` ou use `pnpm dev`.");
  }
});

function shutdown(): void {
  simulator?.stop();
  if (heartbeat) {
    clearInterval(heartbeat);
  }
  server.close();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
