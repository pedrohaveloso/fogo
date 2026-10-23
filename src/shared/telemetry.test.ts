import { describe, expect, it } from "vitest";
import { NOW, makeEquipment } from "../server/test-fixtures.ts";
import { SILENT_AFTER_MINUTES, silentMinutes } from "./telemetry.ts";

const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("silentMinutes", () => {
  it("counts the minutes an operational unit has been quiet past the limit", () => {
    expect(silentMinutes(makeEquipment({ lastSeenAt: ago(12) }), NOW)).toBeCloseTo(12, 6);
    expect(silentMinutes(makeEquipment({ lastSeenAt: ago(SILENT_AFTER_MINUTES) }), NOW)).toBe(
      SILENT_AFTER_MINUTES,
    );
  });

  it("ignores fresh contact and units that are not expected to report", () => {
    expect(silentMinutes(makeEquipment({ lastSeenAt: ago(1) }), NOW)).toBeNull();
    expect(
      silentMinutes(makeEquipment({ status: "malfunction", lastSeenAt: ago(60) }), NOW),
    ).toBeNull();
    expect(
      silentMinutes(makeEquipment({ status: "not_installed", installedAt: null }), NOW),
    ).toBeNull();
  });

  it("treats a unit that never reported as silent", () => {
    expect(silentMinutes(makeEquipment({ lastSeenAt: null }), NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});
