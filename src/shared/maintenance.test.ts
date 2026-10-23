import { describe, expect, it } from "vitest";
import { NOW, makeEquipment } from "../server/test-fixtures.ts";
import { maintenanceDaysLeft, maintenanceState } from "./maintenance.ts";

describe("maintenanceDaysLeft", () => {
  it("ignores equipment that is stolen, not in use or without a date", () => {
    expect(maintenanceDaysLeft(makeEquipment({ status: "stolen" }), NOW)).toBeNull();
    expect(maintenanceDaysLeft(makeEquipment({ status: "disabled" }), NOW)).toBeNull();
    expect(maintenanceDaysLeft(makeEquipment({ nextMaintenanceAt: null }), NOW)).toBeNull();
    expect(maintenanceDaysLeft(makeEquipment({ nextMaintenanceAt: "2026-10-20" }), NOW)).toBe(6);
  });
});

function scheduledFor(nextMaintenanceAt: string | null) {
  return maintenanceState(makeEquipment({ maintenanceNeed: "scheduled", nextMaintenanceAt }), NOW);
}

describe("maintenanceState", () => {
  it("is urgent when immediate maintenance was requested, whatever the date", () => {
    expect(
      maintenanceState(
        makeEquipment({ maintenanceNeed: "immediate", nextMaintenanceAt: null }),
        NOW,
      ),
    ).toBe("urgent");
    expect(
      maintenanceState(makeEquipment({ status: "malfunction", maintenanceNeed: "immediate" }), NOW),
    ).toBe("urgent");
  });

  it("is urgent when overdue and soon up to seven days ahead", () => {
    expect(scheduledFor("2026-10-13")).toBe("urgent");
    expect(scheduledFor("2026-10-14")).toBe("soon");
    expect(scheduledFor("2026-10-21")).toBe("soon");
    expect(scheduledFor("2026-10-22")).toBeNull();
    expect(scheduledFor(null)).toBeNull();
  });

  it("ignores stolen, disabled and not installed equipment", () => {
    for (const status of ["stolen", "disabled", "not_installed"] as const) {
      expect(
        maintenanceState(
          makeEquipment({ status, maintenanceNeed: "immediate", nextMaintenanceAt: "2026-10-01" }),
          NOW,
        ),
      ).toBeNull();
    }
  });
});
