import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { parseNeighborhoodShape, parseNewNeighborhood } from "../validation.ts";

export function neighborhoodRoutes(deps: AppDeps): Hono {
  const { shapes, hub, predictions, now } = deps;
  const routes = new Hono();

  const changed = () => {
    predictions.invalidate();
    hub.publish({ metaChanged: true }, now());
  };

  routes.get("/neighborhoods", (c) => c.json(shapes.list()));

  routes.post("/neighborhoods", async (c) => {
    const shape = shapes.create(parseNewNeighborhood(await c.req.json()), now());
    changed();
    return c.json(shape, 201);
  });

  routes.delete("/neighborhoods/:id", (c) => {
    if (!shapes.remove(c.req.param("id"))) {
      return c.json({ error: "Bairro não encontrado" }, 404);
    }
    changed();
    return c.body(null, 204);
  });

  routes.put("/neighborhoods/:id/shape", async (c) => {
    const polygon = parseNeighborhoodShape(await c.req.json());
    const shape = shapes.save(c.req.param("id"), polygon, now());
    if (!shape) {
      return c.json({ error: "Bairro não encontrado" }, 404);
    }
    changed();
    return c.json(shape);
  });

  routes.delete("/neighborhoods/:id/shape", (c) => {
    const shape = shapes.reset(c.req.param("id"), now());
    if (!shape) {
      return c.json({ error: "Bairro não encontrado" }, 404);
    }
    changed();
    return c.json(shape);
  });

  return routes;
}
