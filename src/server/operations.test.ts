import { describe, expect, it } from "vitest";
import type { Alert, Anomaly, AreaHealth, HealthLevel } from "../shared/types.ts";
import { city } from "./city.ts";
import {
  computeCityHealth,
  computeSummary,
  levelSince,
  type OperationsInput,
} from "./operations.ts";
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

function fragataOccurrence(id: number, severity: 1 | 2 | 3 | 4, waiting: boolean) {
  return makeOccurrence({
    id,
    severity,
    neighborhoodId: "fragata",
    status: waiting ? "open" : "responding",
    agentId: waiting ? null : id,
  });
}

function fragataHealth(occurrences: ReturnType<typeof makeOccurrence>[]) {
  const summary = computeSummary(input({ occurrences }));
  return summary.neighborhoods.find((item) => item.id === "fragata")!;
}

function criticalAlert(id: string, acknowledged = false): Alert {
  return {
    id,
    level: "critical",
    category: "anomaly",
    title: `Concentração incomum de ocorrências em ${id}`,
    detail: "",
    target: null,
    lat: null,
    lng: null,
    since: new Date(NOW).toISOString(),
    acknowledged,
  };
}

function makeAnomaly(id: string, kind: Anomaly["kind"]): Anomaly {
  return {
    id,
    kind,
    title: id,
    detail: "detalhe",
    score: 5,
    observed: 0,
    expected: 100,
    equipmentId: null,
    neighborhoodId: "centro",
    detectedAt: new Date(NOW).toISOString(),
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
    expect(byId.get("telemetry-silent-1")?.level).toBe("warning");
    expect(byId.get("maintenance-overdue-2")?.title).toBe("Manutenção vencida há 13 dias");
    expect(byId.get("maintenance-soon-3")?.level).toBe("info");
    expect(summary.kpis.maintenanceUrgent).toBe(1);
    expect(summary.kpis.silent).toBe(1);
    expect(summary.kpis.maintenanceSoon).toBe(1);
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

  it("raises a neighborhood only when occurrences pile up or wait for a team", () => {
    expect(fragataHealth([fragataOccurrence(1, 3, false)]).level).toBe("normal");
    expect(
      fragataHealth([fragataOccurrence(1, 3, false), fragataOccurrence(2, 3, false)]),
    ).toMatchObject({
      level: "attention",
      reasons: ["2 ocorrências graves em atendimento"],
    });
    expect(fragataHealth([fragataOccurrence(1, 3, true)])).toMatchObject({
      level: "attention",
      reasons: ["1 ocorrência grave sem equipe"],
    });
    expect(fragataHealth([fragataOccurrence(1, 4, true)]).level).toBe("critical");
    expect(
      fragataHealth([fragataOccurrence(1, 3, true), fragataOccurrence(2, 3, true)]),
    ).toMatchObject({
      level: "critical",
      reasons: ["2 ocorrências graves sem equipe"],
    });
    expect(
      fragataHealth([
        fragataOccurrence(1, 1, false),
        fragataOccurrence(2, 2, false),
        fragataOccurrence(3, 1, true),
      ]),
    ).toMatchObject({ level: "attention", reasons: ["3 ocorrências em aberto"] });
  });

  it("keeps a region normal while a few serious occurrences are being handled", () => {
    const regionId = city.neighborhoods.find((item) => item.id === "fragata")!.regionId;
    const members = city.neighborhoods.filter((item) => item.regionId === regionId);
    const occurrences = members.slice(0, 3).map((item, index) =>
      makeOccurrence({
        id: index + 1,
        severity: 3,
        neighborhoodId: item.id,
        status: "responding",
        agentId: index + 1,
      }),
    );
    const summary = computeSummary(input({ occurrences }));
    expect(summary.regions.find((item) => item.id === regionId)!.level).toBe("normal");
    const busier = computeSummary(
      input({
        occurrences: [
          ...occurrences,
          makeOccurrence({
            id: 9,
            severity: 3,
            neighborhoodId: members[3]!.id,
            status: "responding",
            agentId: 9,
          }),
        ],
      }),
    );
    expect(busier.regions.find((item) => item.id === regionId)).toMatchObject({
      level: "attention",
      reasons: ["4 ocorrências graves em atendimento"],
    });
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

  it("keeps critical for occurrences that still need a team", () => {
    const summary = computeSummary(
      input({
        occurrences: [
          makeOccurrence({ id: 1, severity: 3, agentId: null }),
          makeOccurrence({ id: 2, severity: 4, agentId: 7, status: "responding" }),
          makeOccurrence({ id: 3, severity: 3, agentId: 7, status: "responding" }),
        ],
      }),
    );
    const level = (id: string) => summary.alerts.find((alert) => alert.id === id)?.level;
    expect(level("occurrence-1")).toBe("critical");
    expect(level("occurrence-2")).toBe("warning");
    expect(level("occurrence-3")).toBe("info");
  });

  it("demotes critical alerts that stayed active for more than a day", () => {
    const summary = computeSummary(
      input({
        equipment: [
          makeEquipment({
            id: 1,
            type: "smart_traffic_light",
            status: "malfunction",
            updatedAt: new Date(NOW - 25 * 3_600_000).toISOString(),
          }),
          makeEquipment({
            id: 2,
            type: "smart_traffic_light",
            status: "malfunction",
            updatedAt: new Date(NOW - 23 * 3_600_000).toISOString(),
          }),
        ],
      }),
    );
    const level = (id: string) => summary.alerts.find((alert) => alert.id === id)?.level;
    expect(level("equipment-malfunction-1")).toBe("warning");
    expect(level("equipment-malfunction-2")).toBe("critical");
    const camera = computeSummary(
      input({ equipment: [makeEquipment({ id: 3, type: "camera", status: "malfunction" })] }),
    );
    expect(camera.alerts.find((alert) => alert.id === "equipment-malfunction-3")?.level).toBe(
      "warning",
    );
  });

  it("treats a stuck sensor as a warning and a burst of occurrences as critical", () => {
    const summary = computeSummary(
      input({
        anomalies: [
          makeAnomaly("silent", "silent_device"),
          makeAnomaly("spike", "occurrence_spike"),
        ],
      }),
    );
    const level = (id: string) => summary.alerts.find((alert) => alert.id === id)?.level;
    expect(level("anomaly-silent")).toBe("warning");
    expect(level("anomaly-spike")).toBe("critical");
  });
});

function region(name: string, level: HealthLevel): AreaHealth {
  return {
    id: name,
    name,
    equipmentTotal: 0,
    operational: 0,
    unavailable: 0,
    availabilityPct: 100,
    openOccurrences: 0,
    severeOccurrences: 0,
    agentsActive: 0,
    level,
    reasons: [],
  };
}

describe("computeCityHealth", () => {
  it("is normal when every region is normal and no occurrence waits for a team", () => {
    expect(
      computeCityHealth(
        [region("Centro", "normal"), region("Zona Sul", "normal")],
        [
          makeOccurrence({ status: "responding", severity: 4 }),
          makeOccurrence({ status: "resolved" }),
        ],
      ),
    ).toEqual({ level: "normal", reasons: [] });
  });

  it("asks for attention when a region does or occurrences wait for a team", () => {
    expect(
      computeCityHealth(
        [
          region("Centro", "attention"),
          region("Zona Norte", "attention"),
          region("Zona Sul", "normal"),
        ],
        [makeOccurrence({ severity: 3 }), makeOccurrence({ severity: 1 })],
      ),
    ).toEqual({
      level: "attention",
      reasons: ["Centro e Zona Norte pedem atenção", "2 ocorrências esperando equipe"],
    });
    expect(computeCityHealth([region("Centro", "attention")], [])).toEqual({
      level: "attention",
      reasons: ["Centro pede atenção"],
    });
    expect(computeCityHealth([region("Centro", "normal")], [makeOccurrence()])).toEqual({
      level: "attention",
      reasons: ["1 ocorrência esperando equipe"],
    });
  });

  it("is critical for a critical region or a critical occurrence waiting, naming only those", () => {
    expect(
      computeCityHealth(
        [region("Centro", "critical"), region("Zona Sul", "attention")],
        [makeOccurrence({ severity: 4 }), makeOccurrence({ severity: 4 }), makeOccurrence()],
      ),
    ).toEqual({
      level: "critical",
      reasons: ["Centro em situação crítica", "2 ocorrências críticas esperando equipe"],
    });
    expect(
      computeCityHealth([region("Centro", "normal")], [makeOccurrence({ severity: 4 })]),
    ).toEqual({
      level: "critical",
      reasons: ["1 ocorrência crítica esperando equipe"],
    });
  });

  it("never reads normal while a critical alert waits for acknowledgment", () => {
    expect(computeCityHealth([region("Centro", "normal")], [], [criticalAlert("Banzato")])).toEqual(
      {
        level: "attention",
        reasons: ["Concentração incomum de ocorrências em Banzato"],
      },
    );
    expect(
      computeCityHealth(
        [region("Centro", "normal")],
        [],
        [criticalAlert("Banzato"), criticalAlert("Fragata")],
      ),
    ).toEqual({ level: "attention", reasons: ["2 alertas críticos sem reconhecimento"] });
    expect(
      computeCityHealth([region("Centro", "normal")], [], [criticalAlert("Banzato", true)]),
    ).toEqual({
      level: "normal",
      reasons: [],
    });
  });

  it("puts a neighborhood with an occurrence burst in attention and names it in the city", () => {
    const summary = computeSummary(
      input({ anomalies: [makeAnomaly("occurrence_spike-fragata", "occurrence_spike")] }),
    );
    const centro = summary.neighborhoods.find((item) => item.id === "centro")!;
    expect(centro).toMatchObject({
      level: "attention",
      reasons: ["Concentração incomum de ocorrências na última hora"],
    });
    expect(summary.city.level).toBe("attention");
  });

  it("names the cause when a single region drives the level", () => {
    const west = {
      ...region("Zona Oeste", "critical"),
      reasons: ["2 ocorrências graves sem equipe"],
    };
    expect(computeCityHealth([west], []).reasons).toEqual([
      "Zona Oeste em situação crítica: 2 ocorrências graves sem equipe",
    ]);
    const south = { ...region("Zona Sul", "attention"), reasons: ["Disponibilidade em 80%"] };
    expect(computeCityHealth([south], []).reasons).toEqual([
      "Zona Sul pede atenção: disponibilidade em 80%",
    ]);
  });
});

describe("levelSince", () => {
  it("keeps the start time while the level holds and resets when it changes", () => {
    const first = levelSince(null, "attention", NOW);
    expect(first).toEqual({ level: "attention", since: new Date(NOW).toISOString() });
    expect(levelSince(first, "attention", NOW + 60_000)).toBe(first);
    expect(levelSince(first, "critical", NOW + 120_000)).toEqual({
      level: "critical",
      since: new Date(NOW + 120_000).toISOString(),
    });
  });
});
