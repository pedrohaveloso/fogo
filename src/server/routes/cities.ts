import { Hono } from "hono";
import { visibleCityIds } from "../access.ts";
import type { AppDeps, AppEnv } from "../app.ts";
import { parseCityBoundary, parseNewCity } from "../validation.ts";

export function cityRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, cities, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) =>
    c.json(await cities.summaries(await visibleCityIds(db, c.get("user")))),
  );

  routes.post("/", async (c) => {
    const context = await cities.create(parseNewCity(await c.req.json()), now());
    return c.json(await cities.detail(context.city.city.id), 201);
  });

  return routes;
}

export function cityAdminRoutes(deps: AppDeps): Hono<AppEnv> {
  const { cities, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => c.json(await cities.detail(c.get("context").city.city.id)));

  routes.put("/boundary", async (c) => {
    const id = c.get("context").city.city.id;
    const context = await cities.updateBoundary(id, parseCityBoundary(await c.req.json()), now());
    context?.hub.publish({ metaChanged: true }, now());
    return c.json(await cities.detail(id));
  });

  routes.delete("/", async (c) => {
    await cities.remove(c.get("context").city.city.id);
    return c.body(null, 204);
  });

  return routes;
}
