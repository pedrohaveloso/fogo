import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";

const ALLOWED_HORIZONS = new Set([2, 4, 6, 8, 12, 24]);

function horizon(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return ALLOWED_HORIZONS.has(value) ? value : fallback;
}

export function predictionRoutes(deps: AppDeps): Hono<AppEnv> {
  const { now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/risk", async (c) =>
    c.json(await c.get("context").predictions.risk(now(), horizon(c.req.query("hours"), 6))),
  );
  routes.get("/staffing", async (c) =>
    c.json(await c.get("context").predictions.staffing(now(), horizon(c.req.query("hours"), 4))),
  );
  routes.get("/anomalies", async (c) =>
    c.json(await c.get("context").predictions.anomalies(now())),
  );
  routes.get("/failures", async (c) => c.json(await c.get("context").predictions.failures(now())));
  routes.get("/trends", async (c) => c.json(await c.get("context").predictions.trends(now())));
  routes.get("/backtest", async (c) => c.json(await c.get("context").predictions.backtest(now())));

  return routes;
}
