import { Hono } from "hono";
import { DAY, HOUR } from "../../shared/time.ts";
import type { AgentInput } from "../../shared/types.ts";
import { lookupAddress } from "../address.ts";
import type { AppDeps } from "../app.ts";
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

export function inventoryRoutes(deps: AppDeps): Hono {
  const { db, city, hub, predictions, now } = deps;
  const routes = new Hono();

  const changed = () => predictions.invalidate();

  routes.get("/meta", (c) =>
    c.json({
      city: city.city,
      regions: city.regions,
      neighborhoods: city.neighborhoods,
      landmarks: landmarksOf(city),
      streets: streetPlacesOf(city),
      serverTime: new Date(now()).toISOString(),
      liveMultiplier: deps.liveMultiplier,
      mode: deps.mode,
    }),
  );

  routes.get("/address/:cep", async (c) => {
    const result = await lookupAddress(city, c.req.param("cep"), deps.fetchImpl);
    return result ? c.json(result) : c.json({ error: "CEP não encontrado" }, 404);
  });

  routes.get("/equipment", (c) => {
    const { type, status, neighborhood, region, agency, q } = c.req.query();
    const search = q?.trim().toLowerCase();
    const items = listEquipment(db).filter(
      (item) =>
        (!type || item.type === type) &&
        (!status || item.status === status) &&
        (!neighborhood || item.neighborhoodId === neighborhood) &&
        (!region || regionOfNeighborhood(item.neighborhoodId) === region) &&
        (!agency || item.agency === agency) &&
        (!search ||
          [item.serialNumber, item.brand, item.model, item.street, item.reference].some((field) =>
            field.toLowerCase().includes(search),
          )),
    );
    return c.json(items);
  });

  routes.get("/equipment/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const item = id === null ? null : getEquipment(db, id);
    if (!item) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    const occurrences = db
      .prepare(
        "SELECT id, kind, severity, status, description, created_at FROM occurrences WHERE equipment_id = ? ORDER BY created_at DESC LIMIT 10",
      )
      .all(item.id) as OccurrenceRow[];
    const operator = listAgents(db).find((agent) => agent.vehicleId === item.id) ?? null;
    return c.json({
      equipment: item,
      history: statusHistory(db, item.id, 20),
      readings: readingsSince(db, item.id, now() - 48 * HOUR),
      occurrences: occurrences.map(toOccurrenceSummary),
      operator,
      tag: tagFor(db, { kind: "equipment", id: item.id }),
    });
  });

  routes.post("/equipment", async (c) => {
    const input = parseEquipmentInput(await c.req.json());
    const item = createEquipment(db, input, now());
    changed();
    hub.publish({ equipment: [item] }, now());
    return c.json(item, 201);
  });

  routes.put("/equipment/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    const input = parseEquipmentInput(await c.req.json());
    const item = updateEquipment(db, id, input, now());
    if (!item) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    changed();
    hub.publish({ equipment: [item] }, now());
    return c.json(item);
  });

  routes.delete("/equipment/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !deleteEquipment(db, id)) {
      return c.json({ error: "Equipamento não encontrado" }, 404);
    }
    changed();
    hub.publish({ removedEquipment: [id] }, now());
    return c.body(null, 204);
  });

  function checkVehicle(input: AgentInput, agentId: number | null): void {
    if (input.vehicleId === null) {
      return;
    }
    const vehicle = getEquipment(db, input.vehicleId);
    if (!vehicle || !VEHICLE_TYPES.has(vehicle.type)) {
      throw new ValidationError([
        { path: "vehicleId", message: "Veículo precisa ser uma moto ou viatura cadastrada" },
      ]);
    }
    const holder = listAgents(db).find(
      (agent) => agent.vehicleId === input.vehicleId && agent.id !== agentId,
    );
    if (holder) {
      throw new ValidationError([
        { path: "vehicleId", message: `Veículo já vinculado a ${holder.name}` },
      ]);
    }
  }

  routes.get("/agents", (c) => c.json(listAgents(db)));

  routes.get("/agents/:id", (c) => {
    const id = parseId(c.req.param("id"));
    const agent = id === null ? null : getAgent(db, id);
    if (!agent) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    const handled = db
      .prepare(
        "SELECT id, kind, severity, status, description, created_at FROM occurrences WHERE agent_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 10",
      )
      .all(agent.id, now() - 7 * DAY) as OccurrenceRow[];
    return c.json({
      agent,
      vehicle: agent.vehicleId === null ? null : getEquipment(db, agent.vehicleId),
      occurrences: handled.map(toOccurrenceSummary),
      tag: tagFor(db, { kind: "agent", id: agent.id }),
    });
  });

  routes.post("/agents", async (c) => {
    const input = parseAgentInput(await c.req.json());
    checkVehicle(input, null);
    const agent = createAgent(db, input, now());
    changed();
    hub.publish({ agentRecords: [agent] }, now());
    return c.json(agent, 201);
  });

  routes.put("/agents/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    const input = parseAgentInput(await c.req.json());
    checkVehicle(input, id);
    const agent = updateAgent(db, id, input, now());
    if (!agent) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    changed();
    hub.publish({ agentRecords: [agent] }, now());
    return c.json(agent);
  });

  routes.delete("/agents/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null || !deleteAgent(db, id)) {
      return c.json({ error: "Agente não encontrado" }, 404);
    }
    changed();
    hub.publish({ removedAgents: [id] }, now());
    return c.body(null, 204);
  });

  return routes;
}
