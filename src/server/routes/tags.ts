import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";
import { getAgent } from "../repositories/agents.ts";
import { getEquipment } from "../repositories/equipment.ts";
import {
  authenticateTag,
  createTag,
  deleteTag,
  getTag,
  reportLocation,
  targetCityId,
} from "../repositories/tags.ts";
import { parseLocationReport, parseTagTarget } from "../validation.ts";

const BEARER = /^Bearer\s+(\S+)$/i;

export function tagRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.post("/tags", async (c) => {
    const target = parseTagTarget(await c.req.json());
    if ((await targetCityId(db, target)) !== c.get("context").city.city.id) {
      return c.json(
        {
          error:
            target.kind === "equipment" ? "Equipamento não encontrado" : "Agente não encontrado",
        },
        404,
      );
    }
    return c.json(await createTag(db, target, now()), 201);
  });

  routes.delete("/tags/:id", async (c) => {
    const tag = await getTag(db, c.req.param("id"));
    if (!tag || (await targetCityId(db, tag.target)) !== c.get("context").city.city.id) {
      return c.json({ error: "Tag não encontrada" }, 404);
    }
    await deleteTag(db, tag.id);
    return c.body(null, 204);
  });

  return routes;
}

export function deviceRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, cities, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.post("/tags/:id/location", async (c) => {
    const token = BEARER.exec(c.req.header("Authorization") ?? "")?.[1];
    const tag = token ? await authenticateTag(db, c.req.param("id"), token) : null;
    if (!tag) {
      return c.json({ error: "Tag ou token inválido" }, 401);
    }
    const report = parseLocationReport(await c.req.json());
    const current = now();
    const result = await reportLocation(db, tag, report, current);
    if (!result.applied) {
      return c.json({ applied: false, reason: "Leitura mais antiga que a última recebida" });
    }
    if (result.target.kind === "equipment") {
      const equipment = await getEquipment(db, result.target.id);
      if (equipment) {
        cities.get(equipment.cityId)?.hub.publish({ equipment: [equipment] }, current);
      }
    } else {
      const agent = await getAgent(db, result.target.id);
      if (agent) {
        cities.get(agent.cityId)?.hub.publish({ agentRecords: [agent] }, current);
      }
    }
    return c.json({ applied: true, at: new Date(result.at).toISOString() });
  });

  return routes;
}
