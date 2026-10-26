import { Hono } from "hono";
import { DAY, HOUR } from "../../shared/time.ts";
import type { AgentInput } from "../../shared/types.ts";
import { visibleCityIds } from "../access.ts";
import { lookupAddress } from "../address.ts";
import type { AppDeps, AppEnv } from "../app.ts";
import { landmarksOf, regionOfNeighborhood, streetPlacesOf } from "../city.ts";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "../repositories/agents.ts";
import {
  createEquipment,
  deleteEquipment,
  getEquipment,
  listEquipment,
  readingsSince,
  statusHistory,
  updateEquipment,
} from "../repositories/equipment.ts";
import { tagFor } from "../repositories/tags.ts";
import { ValidationError, parseAgentInput, parseEquipmentInput, parseId } from "../validation.ts";

const VEHICLE_TYPES = new Set(["agent_motorcycle", "patrol_vehicle"]);

type OccurrenceRow = {
  id: number;
  kind: string;
  severity: number;
  status: string;
  description: string;
  created_at: number;
};

function toOccurrenceSummary(row: OccurrenceRow) {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function inventoryRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, cities, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/meta", (c) => {
    const { city, liveMultiplier } = c.get("context");
    return c.json({
      city: city.city,
      regions: city.regions,
      neighborhoods: city.neighborhoods,
      agencies: city.agencies,
      landmarks: landmarksOf(city),
      streets: streetPlacesOf(city),
      serverTime: new Date(now()).toISOString(),
      liveMultiplier,
      mode: deps.mode,
    });
  });

  routes.get("/address/:cep", async (c) => {
    const result = await lookupAddress(c.get("context").city, c.req.param("cep"), deps.fetchImpl);
    return result ? c.json(result) : c.json({ error: "CEP não encontrado" }, 404);
  });

  routes.get("/equipment", async (c) => {
    const { city } = c.get("context");
    const { type, status, neighborhood, region, agency, q } = c.req.query();
    const search = q?.trim().toLowerCase();
    const items = (await listEquipment(db, city.city.id)).filter(
      (item) =>
        (!type || item.type === type) &&
        (!status || item.status === status) &&
        (!neighborhood || item.neighborhoodId === neighborhood) &&
        (!region || regionOfNeighborhood(city, item.neighborhoodId) === region) &&
        (!agency || item.agencyId === Number(agency)) &&
        (!search ||
          [item.serialNumber, item.brand, item.model, item.street, item.reference].some((field) =>
            field.toLowerCase().includes(search),
          )),
    );
    return c.json(items);
  });

  async function equipmentIn(cityId: number, raw: string) {
    const id = parseId(raw);
    const item = id === null ? null : await getEquipment(db, id);
    return item && item.cityId === cityId ? item : null;
  }

  routes.get("/equipment/:id", async (c) => {
    const { city } = c.get("context");
    const item = await equipmentIn(city.city.id, c.req.param("id"));
    if (!item) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    const [occurrences, agents, history, readings, tag] = await Promise.all([
      db.query<OccurrenceRow>(
        "SELECT id, kind, severity, status, description, created_at FROM occurrences WHERE equipment_id = $1 ORDER BY created_at DESC LIMIT 10",
        [item.id],
      ),
      listAgents(db, city.city.id),
      statusHistory(db, item.id, 20),
      readingsSince(db, item.id, now() - 48 * HOUR),
      tagFor(db, { kind: "equipment", id: item.id }),
    ]);
    return c.json({
      equipment: item,
      history,
      readings,
      occurrences: occurrences.map(toOccurrenceSummary),
      operator: agents.find((agent) => agent.vehicleId === item.id) ?? null,
      tag,
    });
  });

  async function cityLookup(user: AppEnv["Variables"]["user"]) {
    const ids = await visibleCityIds(db, user);
    return (id: number) => (ids === null || ids.includes(id) ? cities.get(id)?.city : undefined);
  }

  routes.post("/equipment", async (c) => {
    const input = parseEquipmentInput(await c.req.json(), await cityLookup(c.get("user")));
    const item = await createEquipment(db, input, now());
    const target = cities.get(item.cityId)!;
    target.predictions.invalidate();
    await target.hub.publish({ equipment: [item] }, now());
    return c.json(item, 201);
  });

  async function holderOf(vehicleId: number, agentId: number | null) {
    const row = await db.one<{ id: number; name: string }>(
      "SELECT id, name FROM agents WHERE vehicle_id = $1 AND id IS DISTINCT FROM $2",
      [vehicleId, agentId],
    );
    return row ?? null;
  }

  routes.put("/equipment/:id", async (c) => {
    const context = c.get("context");
    const previous = await equipmentIn(context.city.city.id, c.req.param("id"));
    if (!previous) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    const input = parseEquipmentInput(await c.req.json(), await cityLookup(c.get("user")));
    if (input.cityId !== previous.cityId && (await holderOf(previous.id, null))) {
      throw new ValidationError([
        { path: "cityId", message: "Desvincule o agente deste veículo antes de mudar de cidade" },
      ]);
    }
    const item = (await updateEquipment(db, previous.id, input, now()))!;
    const target = cities.get(item.cityId)!;
    if (target !== context) {
      context.predictions.invalidate();
      await context.hub.publish({ removedEquipment: [item.id] }, now());
    }
    target.predictions.invalidate();
    await target.hub.publish({ equipment: [item] }, now());
    return c.json(item);
  });

  routes.delete("/equipment/:id", async (c) => {
    const { hub, predictions, city } = c.get("context");
    const item = await equipmentIn(city.city.id, c.req.param("id"));
    if (!item || !(await deleteEquipment(db, item.id))) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    predictions.invalidate();
    await hub.publish({ removedEquipment: [item.id] }, now());
    return c.body(null, 204);
  });

  async function checkVehicle(cityId: number, input: AgentInput, agentId: number | null) {
    if (input.vehicleId === null) {
      return;
    }
    const vehicle = await getEquipment(db, input.vehicleId);
    if (!vehicle || vehicle.cityId !== cityId || !VEHICLE_TYPES.has(vehicle.type)) {
      throw new ValidationError([
        { path: "vehicleId", message: "Veículo precisa ser uma moto ou viatura cadastrada" },
      ]);
    }
    const holder = await holderOf(input.vehicleId, agentId);
    if (holder) {
      throw new ValidationError([
        { path: "vehicleId", message: `Veículo já vinculado a ${holder.name}` },
      ]);
    }
  }

  async function agentIn(cityId: number, raw: string) {
    const id = parseId(raw);
    const agent = id === null ? null : await getAgent(db, id);
    return agent && agent.cityId === cityId ? agent : null;
  }

  routes.get("/agents", async (c) => c.json(await listAgents(db, c.get("context").city.city.id)));

  routes.get("/agents/:id", async (c) => {
    const agent = await agentIn(c.get("context").city.city.id, c.req.param("id"));
    if (!agent) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    const [handled, vehicle, tag] = await Promise.all([
      db.query<OccurrenceRow>(
        "SELECT id, kind, severity, status, description, created_at FROM occurrences WHERE agent_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 10",
        [agent.id, now() - 7 * DAY],
      ),
      agent.vehicleId === null ? null : getEquipment(db, agent.vehicleId),
      tagFor(db, { kind: "agent", id: agent.id }),
    ]);
    return c.json({ agent, vehicle, occurrences: handled.map(toOccurrenceSummary), tag });
  });

  routes.post("/agents", async (c) => {
    const { city, hub, predictions } = c.get("context");
    const input = parseAgentInput(await c.req.json(), city);
    await checkVehicle(city.city.id, input, null);
    const agent = await createAgent(db, city.city.id, input, now());
    predictions.invalidate();
    await hub.publish({ agentRecords: [agent] }, now());
    return c.json(agent, 201);
  });

  routes.put("/agents/:id", async (c) => {
    const { city, hub, predictions } = c.get("context");
    const previous = await agentIn(city.city.id, c.req.param("id"));
    if (!previous) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    const input = parseAgentInput(await c.req.json(), city);
    await checkVehicle(city.city.id, input, previous.id);
    const agent = (await updateAgent(db, previous.id, input, now()))!;
    predictions.invalidate();
    await hub.publish({ agentRecords: [agent] }, now());
    return c.json(agent);
  });

  routes.delete("/agents/:id", async (c) => {
    const { city, hub, predictions } = c.get("context");
    const agent = await agentIn(city.city.id, c.req.param("id"));
    if (!agent || !(await deleteAgent(db, agent.id))) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    predictions.invalidate();
    await hub.publish({ removedAgents: [agent.id] }, now());
    return c.body(null, 204);
  });

  return routes;
}
