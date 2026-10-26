import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";
import type { CityContext } from "../cities.ts";
import { createAgency, deleteAgency, renameAgency } from "../repositories/agencies.ts";
import { parseAgencyName, parseId } from "../validation.ts";

const NOT_FOUND = { error: "Órgão não encontrado" };

export function agencyRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, now } = deps;
  const routes = new Hono<AppEnv>();

  const changed = async (context: CityContext) => {
    await context.reload();
    await context.hub.publish({ metaChanged: true }, now());
  };

  routes.get("/agencies", async (c) => c.json(c.get("context").city.agencies));

  routes.post("/agencies", async (c) => {
    const context = c.get("context");
    const agency = await createAgency(
      db,
      context.city.city.id,
      parseAgencyName(await c.req.json()),
      now(),
    );
    await changed(context);
    return c.json(agency, 201);
  });

  routes.put("/agencies/:id", async (c) => {
    const context = c.get("context");
    const id = parseId(c.req.param("id"));
    const name = parseAgencyName(await c.req.json());
    const agency = id === null ? null : await renameAgency(db, context.city.city.id, id, name);
    if (!agency) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.json(agency);
  });

  routes.delete("/agencies/:id", async (c) => {
    const context = c.get("context");
    const id = parseId(c.req.param("id"));
    if (id === null || !(await deleteAgency(db, context.city.city.id, id))) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.body(null, 204);
  });

  return routes;
}
