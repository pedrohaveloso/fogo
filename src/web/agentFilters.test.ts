import { describe, expect, it } from "vitest";
import { makeAgent } from "../server/test-fixtures.ts";
import { EMPTY_AGENT_FILTERS, matchesAgentFilters, type AgentFilters } from "./agentFilters.ts";

const regionOf = new Map([
  ["centro", "center"],
  ["fragata", "south"],
]);

const agent = makeAgent({
  name: "Ana Almeida",
  badge: "AT-1550",
  role: "traffic_agent",
  status: "available",
  baseNeighborhoodId: "fragata",
});

function match(filters: Partial<AgentFilters>, target = agent): boolean {
  return matchesAgentFilters(target, { ...EMPTY_AGENT_FILTERS, ...filters }, regionOf);
}

describe("matchesAgentFilters", () => {
  it("accepts everyone with empty filters", () => {
    expect(match({})).toBe(true);
  });

  it("filters by role, status and the region of the base", () => {
    expect(match({ role: "military_police" })).toBe(false);
    expect(match({ role: "traffic_agent" })).toBe(true);
    expect(match({ status: "off_duty" })).toBe(false);
    expect(match({ regionId: "center" })).toBe(false);
    expect(match({ regionId: "south" })).toBe(true);
  });

  it("searches name and badge ignoring case and spaces around the term", () => {
    expect(match({ search: "  almeida " })).toBe(true);
    expect(match({ search: "at-1550" })).toBe(true);
    expect(match({ search: "PM-" })).toBe(false);
  });

  it("rejects a base outside every known region when a region is chosen", () => {
    expect(match({ regionId: "south" }, makeAgent({ baseNeighborhoodId: "unknown" }))).toBe(false);
  });
});
