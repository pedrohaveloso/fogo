import { describe, expect, it } from "vitest";
import type { Anomaly } from "../shared/types.ts";
import { city } from "./city.ts";
import { computeSummary, maintenanceDaysLeft, type OperationsInput } from "./operations.ts";
import { NOW, makeAgent, makeEquipment, makeOccurrence } from "./test-fixtures.ts";

function input(overrides: Partial<OperationsInput> = {}): OperationsInput {
  return {
    city,
    equipment: [],
    agents: [],
    occurrences: [],
    anomalies: [],
    staffing: null,
    acknowledged: new Set(),
    now: NOW,
    ...overrides,
  };
}

describe("computeSummary", () => {
  it("computes availability excluding equipment not installed or disabled", () => {
    const summary = computeSummary(
      input({
        equipment: [
          makeEquipment({ id: 1 }),
          makeEquipment({ id: 2, status: "malfunction" }),
          makeEquipment({ id: 3, status: "not_installed", installedAt: null }),
          makeEquipment({ id: 4, status: "disabled" }),
        ],
        agents: [
          makeAgent({ id: 1 }),
          makeAgent({ id: 2, status: "responding" }),
          makeAgent({ id: 3, status: "off_duty" }),
        ],
      }),
    );
    expect(summary.kpis).toMatchObject({
      equipmentTotal: 4,
      operational: 1,
      unavailable: 1,
      notInstalled: 1,
      disabled: 1,
      availabilityPct: 50,
      agentsActive: 2,
      agentsOnDuty: 2,
    });
  });

  it("raises critical alerts for broken safety equipment and unassigned severe occurrences", () => {
    const summary = computeSummary(
      input({
        equipment: [makeEquipment({ id: 9, type: "smart_traffic_light", status: "malfunction" })],
        occurrences: [
          makeOccurrence({ id: 5, severity: 3 }),
          makeOccurrence({ id: 6, severity: 1 }),
        ],
      }),
    );
    const ids = summary.alerts.map((alert) => alert.id);
    expect(ids).toContain("equipment-malfunction-9");
    expect(ids).toContain("occurrence-5");
    expect(ids).not.toContain("occurrence-6");
    expect(summary.alerts.find((alert) => alert.id === "occurrence-5")?.level).toBe("critical");
  });

  it("flags silent equipment, overdue and upcoming maintenance", () => {
    const summary = computeSummary(
      input({
        equipment: [
          makeEquipment({ id: 1, lastSeenAt: new Date(NOW - 20 * 60_000).toISOString() }),
          makeEquipment({ id: 2, nextMaintenanceAt: "2026-10-01" }),
          makeEquipment({ id: 3, nextMaintenanceAt: "2026-10-17" }),
        ],
      }),
    );
    const byId = new Map(summary.alerts.map((alert) => [alert.id, alert]));
    expect(byId.get("telemetry-silent-1")?.level).toBe("critical");
    expect(byId.get("maintenance-overdue-2")?.title).toBe("Manutenção vencida há 13 dia(s)");
    expect(byId.get("maintenance-soon-3")?.level).toBe("info");
    expect(summary.kpis.maintenanceOverdue).toBe(1);
    expect(summary.kpis.maintenanceDueSoon).toBe(1);
  });

  it("sorts acknowledged alerts last and marks them", () => {
    const summary = computeSummary(
      input({
        equipment: [
          makeEquipment({ id: 1, status: "stolen" }),
          makeEquipment({ id: 2, status: "stolen" }),
        ],
        acknowledged: new Set(["equipment-stolen-1"]),
      }),
    );
    expect(summary.alerts.at(-1)).toMatchObject({ id: "equipment-stolen-1", acknowledged: true });
    expect(summary.kpis.criticalAlerts).toBe(1);
  });

  it("marks a neighborhood critical when most of its equipment is down", () => {
    const equipment = [1, 2, 3, 4].map((id) =>
      makeEquipment({
        id,
        neighborhoodId: "fragata",
        status: id === 1 ? "operational" : "malfunction",
      }),
    );
    const summary = computeSummary(input({ equipment }));
    const fragata = summary.neighborhoods.find((item) => item.id === "fragata")!;
    expect(fragata.level).toBe("critical");
    expect(fragata.reasons[0]).toContain("25%");
    expect(summary.alerts.some((alert) => alert.id === "region-critical-fragata")).toBe(true);
    const regionId = city.neighborhoods.find((item) => item.id === "fragata")!.regionId;
    expect(summary.regions.find((item) => item.id === regionId)!.level).not.toBe("normal");
  });

  it("turns anomalies and exhausted staffing into alerts", () => {
    const anomaly: Anomaly = {
      id: "flow_drop-1",
      kind: "flow_drop",
      title: "Queda de fluxo",
      detail: "detalhe",
      score: 4,
      observed: 10,
      expected: 100,
      equipmentId: 1,
      neighborhoodId: "centro",
      detectedAt: new Date(NOW).toISOString(),
    };
    const summary = computeSummary(
      input({
        equipment: [makeEquipment({ id: 1 })],
        agents: [makeAgent({ status: "responding" })],
        anomalies: [anomaly],
      }),
    );
    const ids = summary.alerts.map((alert) => alert.id);
    expect(ids).toContain("anomaly-flow_drop-1");
    expect(ids).toContain("staffing-exhausted");
  });
});

describe("maintenanceDaysLeft", () => {
  it("ignores equipment that is stolen or without a date", () => {
    expect(maintenanceDaysLeft(makeEquipment({ status: "stolen" }), NOW)).toBeNull();
    expect(maintenanceDaysLeft(makeEquipment({ nextMaintenanceAt: null }), NOW)).toBeNull();
    expect(maintenanceDaysLeft(makeEquipment({ nextMaintenanceAt: "2026-10-20" }), NOW)).toBe(6);
  });
});
