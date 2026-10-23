import { describe, expect, it } from "vitest";
import { makeAgent, makeEquipment } from "../server/test-fixtures.ts";
import { nearestAvailableAgents } from "./response.ts";

const TARGET: [number, number] = [-49.9458, -22.2139];

describe("nearestAvailableAgents", () => {
  it("ignores agents who are not available", () => {
    const agents = [
      makeAgent({ id: 1, status: "responding" }),
      makeAgent({ id: 2, status: "break" }),
      makeAgent({ id: 3, status: "off_duty" }),
    ];
    expect(nearestAvailableAgents(agents, [], TARGET, 3)).toEqual([]);
  });

  it("returns nothing for an empty roster", () => {
    expect(nearestAvailableAgents([], [], TARGET, 3)).toEqual([]);
  });

  it("orders by arrival time, so a motorcycle from farther away can win over a walker", () => {
    const agents = [
      makeAgent({ id: 1, name: "A pé", lng: -49.9458, lat: -22.2239 }),
      makeAgent({ id: 2, name: "De moto", lng: -49.9458, lat: -22.2439, vehicleId: 10 }),
    ];
    const bike = makeEquipment({ id: 10, type: "agent_motorcycle" });
    const [first, second] = nearestAvailableAgents(agents, [bike], TARGET, 3);
    expect(first?.agent.id).toBe(2);
    expect(second?.agent.id).toBe(1);
    expect(first!.minutes).toBeLessThan(second!.minutes);
  });

  it("falls back to walking when the vehicle is not operational", () => {
    const agents = [makeAgent({ id: 1, lng: -49.9458, lat: -22.2239, vehicleId: 10 })];
    const car = makeEquipment({ id: 10, type: "patrol_vehicle", status: "malfunction" });
    const [walking] = nearestAvailableAgents(agents, [car], TARGET, 3);
    const [driving] = nearestAvailableAgents(
      agents,
      [{ ...car, status: "operational" }],
      TARGET,
      3,
    );
    expect(walking!.minutes).toBeGreaterThan(driving!.minutes);
  });

  it("reports at least one minute and respects the limit", () => {
    const agents = [1, 2, 3, 4].map((id) => makeAgent({ id, name: `Agente ${id}` }));
    const result = nearestAvailableAgents(agents, [], TARGET, 2);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.minutes >= 1)).toBe(true);
  });
});
