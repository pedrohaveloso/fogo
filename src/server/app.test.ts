import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Agent, Equipment, Occurrence, OperationsSnapshot } from "../shared/types.ts";
import { createApp } from "./app.ts";
import { city } from "./city.ts";
import { openDatabase, type Database } from "./db.ts";
import { createLiveHub } from "./live.ts";
import { createPredictionService } from "./predictions/service.ts";
import { seedDatabase } from "./seed/index.ts";
import { NOW } from "./test-fixtures.ts";

let db: Database;
let app: ReturnType<typeof createApp>;
const fetchImpl = vi.fn<typeof fetch>();

const validEquipment = {
  type: "camera",
  serialNumber: "CAM-API-1",
  brand: "Visium",
  model: "VS-1",
  agency: "municipal_guard",
  status: "operational",
  cep: "17500-000",
  street: "Avenida Sampaio Vidal",
  reference: "S/N",
  neighborhoodId: "centro",
  lat: -22.2139,
  lng: -49.9458,
  maintenanceNeed: "none",
  installedAt: "2026-01-01",
  attributes: { nightVision: true, resolution: "4k" },
};

const validAgent = {
  name: "Teste da Silva",
  badge: "AT-API-1",
  role: "traffic_agent",
  shift: "afternoon",
  status: "available",
  baseName: "Base Centro",
  baseNeighborhoodId: "centro",
  lat: -22.2139,
  lng: -49.9458,
};

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  const response = await app.request(`/api${path}`, init);
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T };
}

beforeAll(() => {
  db = openDatabase(":memory:");
  seedDatabase(db, city, { now: NOW, seed: 11, historyDays: 30, readingDays: 2 });
  const predictions = createPredictionService(db, city, 60);
  const hub = createLiveHub(db, city, predictions);
  app = createApp({ db, city, hub, predictions, liveMultiplier: 60, now: () => NOW, fetchImpl });
});

describe("inventory API", () => {
  it("serves city metadata", async () => {
    const { status, body } = await call<{ neighborhoods: unknown[]; liveMultiplier: number }>(
      "GET",
      "/meta",
    );
    expect(status).toBe(200);
    expect(body.neighborhoods.length).toBe(city.neighborhoods.length);
    expect(body.liveMultiplier).toBe(60);
  });

  it("creates, reads, filters, updates and deletes equipment", async () => {
    const created = await call<Equipment>("POST", "/equipment", validEquipment);
    expect(created.status).toBe(201);
    expect(created.body.attributes).toEqual({ nightVision: true, resolution: "4k" });

    const details = await call<{ equipment: Equipment; history: unknown[] }>(
      "GET",
      `/equipment/${created.body.id}`,
    );
    expect(details.body.equipment.serialNumber).toBe("CAM-API-1");
    expect(details.body.history).toHaveLength(1);

    const filtered = await call<Equipment[]>("GET", "/equipment?q=cam-api");
    expect(filtered.body.map((item) => item.id)).toEqual([created.body.id]);

    const updated = await call<Equipment>("PUT", `/equipment/${created.body.id}`, {
      ...validEquipment,
      status: "malfunction",
      maintenanceNeed: "immediate",
    });
    expect(updated.body.status).toBe("malfunction");
    const history = await call<{ history: { status: string }[] }>(
      "GET",
      `/equipment/${created.body.id}`,
    );
    expect(history.body.history[0]!.status).toBe("malfunction");

    expect((await call("DELETE", `/equipment/${created.body.id}`)).status).toBe(204);
    expect((await call("GET", `/equipment/${created.body.id}`)).status).toBe(404);
    expect((await call("DELETE", `/equipment/${created.body.id}`)).status).toBe(404);
  });

  it("rejects duplicate serial numbers, invalid data and malformed JSON", async () => {
    await call("POST", "/equipment", { ...validEquipment, serialNumber: "CAM-DUP" });
    const duplicate = await call<{ issues: { path: string }[] }>("POST", "/equipment", {
      ...validEquipment,
      serialNumber: "CAM-DUP",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.issues[0]!.path).toBe("serialNumber");

    const invalid = await call<{ issues: { path: string }[] }>("POST", "/equipment", {
      ...validEquipment,
      type: "ufo",
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.issues.map((issue) => issue.path)).toContain("type");

    expect((await call("POST", "/equipment", "{not json")).status).toBe(400);
    expect((await call("PUT", "/equipment/999999", validEquipment)).status).toBe(404);
    expect((await call("GET", "/equipment/abc")).status).toBe(404);
  });

  it("validates agent vehicles", async () => {
    const equipment = (await call<Equipment[]>("GET", "/equipment")).body;
    const camera = equipment.find((item) => item.type === "camera")!;
    const wrongVehicle = await call<{ issues: { message: string }[] }>("POST", "/agents", {
      ...validAgent,
      vehicleId: camera.id,
    });
    expect(wrongVehicle.status).toBe(422);

    const agents = (await call<Agent[]>("GET", "/agents")).body;
    const holder = agents.find((agent) => agent.vehicleId !== null)!;
    const taken = await call<{ issues: { message: string }[] }>("POST", "/agents", {
      ...validAgent,
      vehicleId: holder.vehicleId,
    });
    expect(taken.status).toBe(422);
    expect(taken.body.issues[0]!.message).toContain(holder.name);

    const created = await call<Agent>("POST", "/agents", validAgent);
    expect(created.status).toBe(201);
    expect(created.body.agency).toBe("mobility");
    expect((await call("POST", "/agents", validAgent)).status).toBe(409);
    expect((await call("DELETE", `/agents/${created.body.id}`)).status).toBe(204);
    expect((await call("GET", `/agents/${created.body.id}`)).status).toBe(404);
  });
});

describe("operations API", () => {
  it("registers and resolves an occurrence, releasing the agent", async () => {
    const created = await call<Occurrence>("POST", "/occurrences", {
      kind: "accident",
      severity: 4,
      neighborhoodId: "centro",
      lat: -22.2139,
      lng: -49.9458,
      description: "Colisão grave",
    });
    expect(created.status).toBe(201);
    const agent = (await call<Agent[]>("GET", "/agents")).body[0]!;
    db.prepare("UPDATE agents SET status = 'responding', occurrence_id = ? WHERE id = ?").run(
      created.body.id,
      agent.id,
    );

    let snapshot = (await call<OperationsSnapshot>("GET", "/operations/snapshot")).body;
    expect(
      snapshot.alerts.some(
        (alert) => alert.id === `occurrence-${created.body.id}` && alert.level === "critical",
      ),
    ).toBe(true);

    const resolved = await call<Occurrence>("POST", `/occurrences/${created.body.id}/resolve`);
    expect(resolved.body.status).toBe("resolved");
    snapshot = (await call<OperationsSnapshot>("GET", "/operations/snapshot")).body;
    expect(snapshot.agents.find((item) => item.id === agent.id)?.status).toBe("available");
    expect((await call("POST", "/occurrences/999999/resolve")).status).toBe(404);
  });

  it("acknowledges and reopens alerts", async () => {
    const snapshot = (await call<OperationsSnapshot>("GET", "/operations/snapshot")).body;
    const alert = snapshot.alerts[0]!;
    expect((await call("POST", `/alerts/${encodeURIComponent(alert.id)}/ack`)).status).toBe(204);
    let after = (await call<OperationsSnapshot>("GET", "/operations/snapshot")).body;
    expect(after.alerts.find((item) => item.id === alert.id)?.acknowledged).toBe(true);
    expect((await call("DELETE", `/alerts/${encodeURIComponent(alert.id)}/ack`)).status).toBe(204);
    after = (await call<OperationsSnapshot>("GET", "/operations/snapshot")).body;
    expect(after.alerts.find((item) => item.id === alert.id)?.acknowledged).toBe(false);
  });

  it("streams a snapshot as the first server-sent event", async () => {
    const controller = new AbortController();
    const response = await app.request("/api/operations/stream", { signal: controller.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("event: snapshot");
    controller.abort();
    await reader.cancel();
  });

  it("returns heat points and looks up addresses", async () => {
    const heat = await call<[number, number][]>("GET", "/occurrences/heat?days=7");
    expect(heat.body.length).toBeGreaterThan(0);
    const local = await call<{ source: string }>("GET", `/address/${city.streets[0]!.cep}`);
    expect(local.body.source).toBe("local");
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ erro: true })));
    expect((await call("GET", "/address/17519000")).status).toBe(404);
  });

  it("answers unknown routes with JSON", async () => {
    const { status, body } = await call<{ error: string }>("GET", "/nothing-here");
    expect(status).toBe(404);
    expect(body.error).toBe("Recurso não encontrado");
  });
});

describe("predictions API", () => {
  it("serves every prediction and falls back to a default horizon", async () => {
    const risk = await call<{ horizonHours: number; neighborhoods: unknown[] }>(
      "GET",
      "/predictions/risk?hours=999",
    );
    expect(risk.body.horizonHours).toBe(6);
    expect(risk.body.neighborhoods).toHaveLength(city.neighborhoods.length);
    expect(
      (await call<{ horizonHours: number }>("GET", "/predictions/staffing?hours=8")).body
        .horizonHours,
    ).toBe(8);
    const statuses = await Promise.all(
      ["anomalies", "failures", "trends", "backtest"].map(
        async (path) => (await call("GET", `/predictions/${path}`)).status,
      ),
    );
    expect(statuses).toEqual([200, 200, 200, 200]);
  });
});
