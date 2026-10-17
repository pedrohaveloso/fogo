import { Hono } from "hono";
import type { AppDeps } from "../app.ts";

const ALLOWED_HORIZONS = new Set([2, 4, 6, 8, 12, 24]);

function horizon(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return ALLOWED_HORIZONS.has(value) ? value : fallback;
}

export function predictionRoutes(deps: AppDeps): Hono {
  const { predictions, now } = deps;
  const routes = new Hono();

  routes.get("/risk", (c) => c.json(predictions.risk(now(), horizon(c.req.query("hours"), 6))));
  routes.get("/staffing", (c) =>
    c.json(predictions.staffing(now(), horizon(c.req.query("hours"), 4))),
  );
  routes.get("/anomalies", (c) => c.json(predictions.anomalies(now())));
  routes.get("/failures", (c) => c.json(predictions.failures(now())));
  routes.get("/trends", (c) => c.json(predictions.trends(now())));
  routes.get("/backtest", (c) => c.json(predictions.backtest(now())));

  return routes;
}
