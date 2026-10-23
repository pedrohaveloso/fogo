import { describe, expect, it } from "vitest";
import type { Alert } from "../../shared/types.ts";
import { groupAlerts, isFreshAlert, matchesAlertFilter } from "./AlertFeed.tsx";

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

describe("groupAlerts", () => {
  it("groups repeated equipment alerts and keeps the highest level", () => {
    const entries = groupAlerts([
      makeAlert({ id: "equipment-malfunction-1", title: "Patinete com mau funcionamento" }),
      makeAlert({ id: "occurrence-9", category: "occurrence", level: "critical" }),
      makeAlert({
        id: "equipment-malfunction-2",
        title: "Patinete com mau funcionamento",
        level: "critical",
      }),
      makeAlert({ id: "equipment-malfunction-3", title: "Radar com mau funcionamento" }),
    ]);
    expect(entries).toHaveLength(3);
    const group = entries[0]!;
    expect("items" in group && group.items.map((item) => item.id)).toEqual([
      "equipment-malfunction-1",
      "equipment-malfunction-2",
    ]);
    expect("items" in group && group.level).toBe("critical");
    expect(entries[1]).toMatchObject({ id: "occurrence-9" });
    expect(entries[2]).toMatchObject({ id: "equipment-malfunction-3" });
  });

  it("names maintenance groups and never groups occurrences or anomalies", () => {
    const entries = groupAlerts([
      makeAlert({
        id: "maintenance-overdue-1",
        category: "maintenance",
        title: "Vencida há 3 dias",
      }),
      makeAlert({
        id: "maintenance-overdue-2",
        category: "maintenance",
        title: "Vencida há 9 dias",
      }),
      makeAlert({ id: "anomaly-a", category: "anomaly", title: "Concentração" }),
      makeAlert({ id: "anomaly-b", category: "anomaly", title: "Concentração" }),
    ]);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ title: "Manutenções vencidas" });
  });

  it("keeps acknowledged alerts apart from open ones", () => {
    const entries = groupAlerts([
      makeAlert({ id: "telemetry-silent-1", category: "telemetry" }),
      makeAlert({ id: "telemetry-silent-2", category: "telemetry", acknowledged: true }),
    ]);
    expect(entries).toHaveLength(2);
  });
});
