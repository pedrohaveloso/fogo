import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";
import { listAudit } from "../audit.ts";
import { parseId } from "../validation.ts";

export function auditRoutes(deps: AppDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) =>
    c.json(
      await listAudit(deps.db, {
        cityId: parseId(c.req.query("cityId") ?? ""),
        before: parseId(c.req.query("before") ?? ""),
      }),
    ),
  );

  return routes;
}
