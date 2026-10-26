import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { getAgent } from "../repositories/agents.ts";
import { getEquipment } from "../repositories/equipment.ts";
import {
  authenticateTag,
  createTag,
  deleteTag,
  reportLocation,
  targetExists,
} from "../repositories/tags.ts";
import { parseLocationReport, parseTagTarget } from "../validation.ts";

const BEARER = /^Bearer\s+(\S+)$/i;

export function tagRoutes(deps: AppDeps): Hono {
  const { db, hub, now } = deps;
  const routes = new Hono();

  routes.post("/tags", async (c) => {
    const target = parseTagTarget(await c.req.json());
    if (!targetExists(db, target)) {
      return c.json(
        {
          error:
            target.kind === "equipment" ? "Equipamento não encontrado" : "Agente não encontrado",
        },
        404,
      );
    }
    return c.json(createTag(db, target, now()), 201);
  });

  routes.delete("/tags/:id", (c) =>
    deleteTag(db, c.req.param("id"))
      ? c.body(null, 204)
      : c.json({ error: "Tag não encontrada" }, 404),
  );

  routes.post("/tags/:id/location", async (c) => {
    const token = BEARER.exec(c.req.header("Authorization") ?? "")?.[1];
    const tag = token ? authenticateTag(db, c.req.param("id"), token) : null;
    if (!tag) {
      return c.json({ error: "Tag ou token inválido" }, 401);
    }
    const report = parseLocationReport(await c.req.json());
    const current = now();
    const result = reportLocation(db, tag, report, current);
    if (!result.applied) {
      return c.json({ applied: false, reason: "Leitura mais antiga que a última recebida" });
    }
    if (result.target.kind === "equipment") {
      const equipment = getEquipment(db, result.target.id);
      hub.publish({ equipment: equipment ? [equipment] : [] }, current);
    } else {
      const agent = getAgent(db, result.target.id);
      hub.publish({ agentRecords: agent ? [agent] : [] }, current);
    }
    return c.json({ applied: true, at: new Date(result.at).toISOString() });
  });

  return routes;
}
