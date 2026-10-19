import { describe, expect, it } from "vitest";
import type { Alert } from "../../shared/types.ts";
import { isFreshAlert, matchesAlertFilter } from "./AlertFeed.tsx";

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "a1",
    level: "warning",
    category: "equipment",
    title: "Radar sem comunicação",
    detail: "",
    target: null,
    lat: null,
    lng: null,
    since: "2026-10-14T15:00:00.000Z",
    acknowledged: false,
    ...overrides,
  };
}

describe("matchesAlertFilter", () => {
  it("groups categories under each tab", () => {
    const telemetry = makeAlert({ category: "telemetry" });
    const staffing = makeAlert({ category: "staffing", level: "critical" });
    expect(matchesAlertFilter(telemetry, "all")).toBe(true);
    expect(matchesAlertFilter(telemetry, "equipment")).toBe(true);
    expect(matchesAlertFilter(telemetry, "occurrence")).toBe(false);
    expect(matchesAlertFilter(telemetry, "critical")).toBe(false);
    expect(matchesAlertFilter(staffing, "occurrence")).toBe(true);
    expect(matchesAlertFilter(staffing, "critical")).toBe(true);
    expect(matchesAlertFilter(staffing, "maintenance")).toBe(false);
  });
});

describe("isFreshAlert", () => {
  const generatedAt = "2026-10-14T15:00:10.000Z";

  it("flags critical alerts that started in the last few seconds", () => {
    expect(
      isFreshAlert(
        makeAlert({ level: "critical", since: "2026-10-14T15:00:05.000Z" }),
        generatedAt,
      ),
    ).toBe(true);
    expect(
      isFreshAlert(
        makeAlert({ level: "critical", since: "2026-10-14T15:00:04.000Z" }),
        generatedAt,
      ),
    ).toBe(true);
    expect(
      isFreshAlert(
        makeAlert({ level: "critical", since: "2026-10-14T15:00:03.000Z" }),
        generatedAt,
      ),
    ).toBe(false);
  });

  it("ignores warnings and acknowledged alerts", () => {
    const since = "2026-10-14T15:00:09.000Z";
    expect(isFreshAlert(makeAlert({ since }), generatedAt)).toBe(false);
    expect(
      isFreshAlert(makeAlert({ level: "critical", since, acknowledged: true }), generatedAt),
    ).toBe(false);
  });
});
