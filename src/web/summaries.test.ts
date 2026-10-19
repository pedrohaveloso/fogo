import { describe, expect, it } from "vitest";
import { makeAgent, makeEquipment } from "../server/test-fixtures.ts";
import { agentStatusCounts, fleetSummary } from "./summaries.ts";

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
