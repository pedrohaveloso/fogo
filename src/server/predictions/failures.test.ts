import { describe, expect, it } from "vitest";
import { DAY, HOUR } from "../../shared/time.ts";
import { NOW, makeEquipment } from "../test-fixtures.ts";
import { assessFailureRisk, type MaintenanceRecord, type StatusEventRecord } from "./failures.ts";

function scenario() {
  const equipment = Array.from({ length: 20 }, (_, index) =>
    makeEquipment({
      id: index + 1,
      serialNumber: `CAM-${index + 1}`,
      nextMaintenanceAt: index < 10 ? "2026-12-30" : "2026-08-01",
    }),
  );
  const events: StatusEventRecord[] = [];
  const maintenance: MaintenanceRecord[] = [];
  for (const item of equipment) {
    events.push({ equipmentId: item.id, status: "operational", at: NOW - 200 * DAY });
    const overdue = item.id > 10;
    if (overdue) {
      maintenance.push({ equipmentId: item.id, at: NOW - 300 * DAY });
    } else {
      maintenance.push(
        { equipmentId: item.id, at: NOW - 150 * DAY },
        { equipmentId: item.id, at: NOW - 60 * DAY },
      );
    }
    const failures = overdue ? [20, 45, 70, 95] : [50];
    for (const daysAgo of failures) {
      const at = NOW - daysAgo * DAY + 2 * HOUR;
      events.push(
        { equipmentId: item.id, status: "malfunction", at },
        { equipmentId: item.id, status: "operational", at: at + 3 * HOUR },
      );
    }
  }
  return { equipment, events, maintenance };
}

describe("assessFailureRisk", () => {
  it("learns that overdue maintenance raises the failure rate", () => {
    const { equipment, events, maintenance } = scenario();
    const report = assessFailureRisk(equipment, events, maintenance, NOW, 120);
    expect(report.overdueHazardRatio).toBeGreaterThan(2.5);
    expect(report.baselineDailyRate["camera"]).toBeGreaterThan(0);
  });

  it("ranks overdue equipment first and explains why", () => {
    const { equipment, events, maintenance } = scenario();
    const report = assessFailureRisk(equipment, events, maintenance, NOW, 120);
    const top = report.items[0]!;
    expect(top.equipmentId).toBeGreaterThan(10);
    expect(top.daysOverdue).toBeGreaterThan(0);
    expect(top.factors[0]).toContain("Manutenção vencida");
    expect(top.recommendation).toContain("atrasada");
    expect(top.probability7d).toBeGreaterThan(report.items.at(-1)!.probability7d);
  });

  it("leaves out equipment that is not operating", () => {
    const { events, maintenance } = scenario();
    const equipment = [
      makeEquipment({ id: 1, status: "stolen" }),
      makeEquipment({ id: 2, status: "not_installed" }),
    ];
    expect(assessFailureRisk(equipment, events, maintenance, NOW, 120).items).toEqual([]);
  });

  it("recommends bringing forward maintenance that is due soon", () => {
    const report = assessFailureRisk(
      [makeEquipment({ nextMaintenanceAt: "2026-10-17" })],
      [],
      [],
      NOW,
      120,
    );
    expect(report.items[0]!.recommendation).toContain("Antecipar");
  });
});
