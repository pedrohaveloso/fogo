import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";
import type { CityContext } from "../cities.ts";
import {
  parseNeighborhoodDetails,
  parseNeighborhoodShape,
  parseNewNeighborhood,
  parseRegionName,
} from "../validation.ts";

const NOT_FOUND = { error: "Bairro não encontrado" };
const REGION_NOT_FOUND = { error: "Zona não encontrada" };

export function neighborhoodRoutes(deps: AppDeps): Hono<AppEnv> {
  const { now } = deps;
  const routes = new Hono<AppEnv>();

  const changed = async ({ predictions, hub }: CityContext) => {
    predictions.invalidate();
    await hub.publish({ metaChanged: true }, now());
  };

  routes.get("/neighborhoods", async (c) => c.json(await c.get("context").shapes.list()));

  routes.post("/neighborhoods", async (c) => {
    const context = c.get("context");
    const input = parseNewNeighborhood(await c.req.json(), context.city);
    const shape = await context.shapes.create(input, now());
    await changed(context);
    return c.json(shape, 201);
  });

  routes.put("/neighborhoods/:id", async (c) => {
    const context = c.get("context");
    const input = parseNeighborhoodDetails(await c.req.json(), context.city);
    const shape = await context.shapes.update(c.req.param("id"), input, now());
    if (!shape) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.json(shape);
  });

  routes.delete("/neighborhoods/:id", async (c) => {
    const context = c.get("context");
    if (!(await context.shapes.remove(c.req.param("id")))) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.body(null, 204);
  });

  routes.put("/neighborhoods/:id/shape", async (c) => {
    const context = c.get("context");
    const polygon = parseNeighborhoodShape(await c.req.json(), context.city);
    const shape = await context.shapes.save(c.req.param("id"), polygon, now());
    if (!shape) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.json(shape);
  });

  routes.delete("/neighborhoods/:id/shape", async (c) => {
    const context = c.get("context");
    const shape = await context.shapes.reset(c.req.param("id"), now());
    if (!shape) {
      return c.json(NOT_FOUND, 404);
    }
    await changed(context);
    return c.json(shape);
  });

  routes.get("/regions", async (c) => c.json(c.get("context").city.regions));

  routes.post("/regions", async (c) => {
    const context = c.get("context");
    const region = await context.shapes.createRegion(parseRegionName(await c.req.json()), now());
    await changed(context);
    return c.json(region, 201);
  });

  routes.put("/regions/:id", async (c) => {
    const context = c.get("context");
    const region = await context.shapes.renameRegion(
      c.req.param("id"),
      parseRegionName(await c.req.json()),
    );
    if (!region) {
      return c.json(REGION_NOT_FOUND, 404);
    }
    await changed(context);
    return c.json(region);
  });

  routes.delete("/regions/:id", async (c) => {
    const context = c.get("context");
    if (!(await context.shapes.removeRegion(c.req.param("id")))) {
      return c.json(REGION_NOT_FOUND, 404);
    }
    await changed(context);
    return c.body(null, 204);
  });

  return routes;
}
