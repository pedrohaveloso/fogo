import { existsSync, rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { city, roads } from "./city.ts";
import { getSetting, openDatabase } from "./db.ts";
import { createLiveHub } from "./live.ts";
import { createNeighborhoodShapes } from "./neighborhoods.ts";
import { createDemandModel } from "./patterns.ts";
import { createPredictionService } from "./predictions/service.ts";
import { isDatabaseEmpty, seedDatabase } from "./seed/index.ts";
import { createSimulator } from "./simulator.ts";

const port = Number(process.env["PORT"] ?? 3210);
const databasePath = process.env["FOGO_DB"] ?? "data/fogo.db";
const liveMultiplier = Number(process.env["FOGO_LIVE_MULTIPLIER"] ?? 20);
const simulationEnabled = process.env["FOGO_SIMULATION"] !== "off";
const seed = Number(process.env["FOGO_SEED"] ?? 20261027);
const webRoot = "dist/web";

if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

const db = openDatabase(databasePath);
if (isDatabaseEmpty(db)) {
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

const seededAt = Number(getSetting(db, "seeded_at") ?? Date.now());
const predictions = createPredictionService(db, city, liveMultiplier);
const hub = createLiveHub(db, city, predictions);
const app = createApp({
  db,
  city,
  hub,
  shapes,
  predictions,
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

const simulator = createSimulator(db, city, roads, hub, createDemandModel(city, seededAt), {
  liveMultiplier,
  tickMs: 2000,
  seed: seed ^ Date.now(),
  seededAt,
});
if (simulationEnabled) {
  simulator.start();
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`F.O.G.O. rodando em http://localhost:${info.port}`);
  if (!existsSync(webRoot)) {
    console.log("Interface não compilada: rode `pnpm build` ou use `pnpm dev`.");
  }
});

function shutdown(): void {
  simulator.stop();
  server.close();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
