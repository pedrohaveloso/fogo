import { describe, expect, it } from "vitest";
import type { CityDataset } from "../../shared/types.ts";
import { NOW, makeAgent } from "../test-fixtures.ts";
import type { RiskModel } from "./risk.ts";
import { planStaffing } from "./staffing.ts";

const city = {
  regions: [
    { id: "center", name: "Centro", polygon: [] },
    { id: "south", name: "Zona Sul", polygon: [] },
  ],
  neighborhoods: [
    { id: "a", name: "A", regionId: "center", lat: 0, lng: 0, polygon: [] },
    { id: "b", name: "B", regionId: "south", lat: 0, lng: 0, polygon: [] },
  ],
} as unknown as CityDataset;

const model = {
  expected: (neighborhoodId: string, kind: string) =>
    neighborhoodId === "b" && kind === "accident" ? 1.5 : 0.05,
} as unknown as RiskModel;

describe("planStaffing", () => {
  it("moves agents from the quiet region to the busy one", () => {
    const agents = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeAgent({ id: index + 1, baseNeighborhoodId: "a" }),
      ),
      makeAgent({ id: 10, baseNeighborhoodId: "b" }),
      makeAgent({ id: 11, baseNeighborhoodId: "b", status: "off_duty" }),
    ];
    const plan = planStaffing(model, city, agents, NOW, 4);
    const south = plan.regions.find((item) => item.regionId === "south")!;
    expect(south.activeAgents).toBe(1);
    expect(south.gap).toBeGreaterThan(0);
    expect(south.action).toContain("para a Zona Sul");
    expect(plan.moves[0]).toMatchObject({ fromRegionId: "center", toRegionId: "south" });
    expect(plan.moves.reduce((sum, move) => sum + move.agents, 0)).toBeLessThanOrEqual(south.gap);
  });

  it("asks for at least one agent per region even with no one on duty", () => {
    const plan = planStaffing(model, city, [], NOW, 2);
    expect(plan.regions.every((item) => item.requiredAgents >= 1)).toBe(true);
    expect(plan.moves).toEqual([]);
  });
});
