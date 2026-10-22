import { describe, expect, it } from "vitest";
import type { OperationsSnapshot, StreamTick } from "../shared/types.ts";
import { makeAgent, makeEquipment, makeOccurrence } from "../server/test-fixtures.ts";
import { applyTick } from "./live.ts";

const summary = {
  generatedAt: "2026-10-14T15:00:00.000Z",
  city: { level: "normal" as const, reasons: [] },
  kpis: {} as OperationsSnapshot["kpis"],
  regions: [],
  neighborhoods: [],
  alerts: [],
};

function snapshot(): OperationsSnapshot {
  return {
    ...summary,
    equipment: [makeEquipment({ id: 1 }), makeEquipment({ id: 2, type: "e_scooter" })],
    agents: [makeAgent({ id: 1 }), makeAgent({ id: 2 })],
    occurrences: [makeOccurrence({ id: 1 })],
  };
}

function tick(change: Partial<StreamTick>): StreamTick {
  return {
    summary: { ...summary, generatedAt: "2026-10-14T15:00:02.000Z" },
    agents: [],
    agentRecords: [],
    movingEquipment: [],
    equipment: [],
    occurrences: [],
    removedEquipment: [],
    removedAgents: [],
    ...change,
  };
}

describe("applyTick", () => {
  it("moves agents and mobile equipment without touching other fields", () => {
    const next = applyTick(
      snapshot(),
      tick({
        agents: [{ id: 2, lat: -22.3, lng: -49.9, status: "responding", occurrenceId: 1 }],
        movingEquipment: [{ id: 2, lat: -22.25, lng: -49.95, battery: 40 }],
      }),
    );
    expect(next.agents[1]).toMatchObject({
      id: 2,
      lat: -22.3,
      status: "responding",
      name: "Ana Teste",
    });
    expect(next.equipment[1]).toMatchObject({
      currentLat: -22.25,
      battery: 40,
      serialNumber: "CAM-TEST-1",
    });
    expect(next.generatedAt).toBe("2026-10-14T15:00:02.000Z");
  });

  it("replaces, adds and removes records", () => {
    const next = applyTick(
      snapshot(),
      tick({
        equipment: [makeEquipment({ id: 1, status: "stolen" }), makeEquipment({ id: 3 })],
        agentRecords: [makeAgent({ id: 9, name: "Novo" })],
        removedEquipment: [2],
        removedAgents: [1],
      }),
    );
    expect(next.equipment.map((item) => [item.id, item.status])).toEqual([
      [1, "stolen"],
      [3, "operational"],
    ]);
    expect(next.agents.map((agent) => agent.id)).toEqual([2, 9]);
  });

  it("drops resolved occurrences and keeps the newest first", () => {
    const next = applyTick(
      snapshot(),
      tick({
        occurrences: [
          makeOccurrence({ id: 1, status: "resolved" }),
          makeOccurrence({ id: 2, createdAt: "2026-10-14T15:00:01.000Z" }),
          makeOccurrence({ id: 3, createdAt: "2026-10-14T14:00:00.000Z" }),
        ],
      }),
    );
    expect(next.occurrences.map((item) => item.id)).toEqual([2, 3]);
  });
});
