import { describe, expect, it } from "vitest";
import { makeAgent, makeEquipment } from "../server/test-fixtures.ts";
import type { Kpis } from "../shared/types.ts";
import { agentStatusCounts, fleetSummary, generalIndicators } from "./summaries.ts";

describe("fleetSummary", () => {
  it("lists every equipment type in catalog order with totals and units out of service", () => {
    const summary = fleetSummary([
      makeEquipment({ id: 1, type: "camera", status: "operational" }),
      makeEquipment({ id: 2, type: "camera", status: "malfunction" }),
      makeEquipment({ id: 3, type: "camera", status: "stolen" }),
      makeEquipment({ id: 4, type: "camera", status: "not_installed" }),
      makeEquipment({ id: 5, type: "radar", status: "maintenance" }),
    ]);
    expect(summary).toHaveLength(12);
    expect(summary[0]).toEqual({ type: "radar", total: 1, down: 1 });
    expect(summary.find((entry) => entry.type === "camera")).toEqual({
      type: "camera",
      total: 4,
      down: 2,
    });
    expect(summary.find((entry) => entry.type === "e_scooter")).toEqual({
      type: "e_scooter",
      total: 0,
      down: 0,
    });
  });
});

describe("agentStatusCounts", () => {
  it("counts agents by status, including statuses with nobody", () => {
    expect(
      agentStatusCounts([
        makeAgent({ id: 1, status: "available" }),
        makeAgent({ id: 2, status: "available" }),
        makeAgent({ id: 3, status: "off_duty" }),
      ]),
    ).toEqual({ available: 2, responding: 0, break: 0, off_duty: 1 });
    expect(agentStatusCounts([])).toEqual({ available: 0, responding: 0, break: 0, off_duty: 0 });
  });
});

const KPIS: Kpis = {
  equipmentTotal: 1282,
  operational: 213,
  unavailable: 47,
  notInstalled: 13,
  disabled: 9,
  availabilityPct: 81.92,
  agentsActive: 29,
  agentsOnDuty: 31,
  agentsTotal: 70,
  openOccurrences: 9,
  criticalAlerts: 3,
  maintenanceOverdue: 1,
  maintenanceDueSoon: 13,
  maintenanceImmediate: 4,
};

describe("generalIndicators", () => {
  it("lists the five indicators the challenge asks for, in Brazilian format", () => {
    expect(generalIndicators(KPIS)).toEqual([
      { key: "total", value: "1.282", label: "equipamentos" },
      { key: "operational", value: "213", label: "operacionais" },
      { key: "unavailable", value: "47", label: "indisponíveis" },
      { key: "availability", value: "82%", label: "de disponibilidade" },
      { key: "agents", value: "29", label: "agentes em atividade" },
    ]);
  });

  it("uses the singular for one and the plural for zero", () => {
    const labels = generalIndicators({
      ...KPIS,
      equipmentTotal: 1,
      operational: 1,
      unavailable: 0,
      availabilityPct: 100,
      agentsActive: 1,
    }).map((item) => `${item.value} ${item.label}`);
    expect(labels).toEqual([
      "1 equipamento",
      "1 operacional",
      "0 indisponíveis",
      "100% de disponibilidade",
      "1 agente em atividade",
    ]);
  });
});
