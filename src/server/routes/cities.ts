import { Hono } from "hono";
import { isStateCode } from "../../shared/states.ts";
import { visibleCityIds } from "../access.ts";
import type { AppDeps, AppEnv } from "../app.ts";
import { createMunicipalityCache, lookupBoundary } from "../places.ts";
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

export function placeRoutes(deps: AppDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const municipalities = createMunicipalityCache(deps.fetchImpl);

  routes.get("/states/:uf/municipalities", async (c) => {
    const uf = c.req.param("uf").toUpperCase();
    if (!isStateCode(uf)) {
      return c.json({ error: "UF não encontrada" }, 404);
    }
    return c.json(await municipalities(uf));
  });

  routes.get("/boundary", async (c) => {
    const { name, uf, ibgeCode } = c.req.query();
    const code = Number(ibgeCode);
    if (!name || !uf || !isStateCode(uf) || !Number.isSafeInteger(code)) {
      return c.json({ error: "Informe município, UF e código do IBGE" }, 400);
    }
    const result = await lookupBoundary(deps.fetchImpl, name, uf, code);
    return result
      ? c.json(result)
      : c.json({ error: "Limite não encontrado no OpenStreetMap. Desenhe no mapa." }, 404);
  });

  return routes;
}
