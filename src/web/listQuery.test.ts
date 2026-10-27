import { describe, expect, it } from "vitest";
import { EMPTY_AGENT_FILTERS } from "./agentFilters.ts";
import { EMPTY_FILTERS } from "./components/OperationsFilters.tsx";
import {
  DEFAULT_SORT,
  agentFromQuery,
  agentQuery,
  equipmentFromQuery,
  equipmentQuery,
  searchQuery,
  showsMapView,
  withMapView,
  withoutMapView,
} from "./listQuery.ts";

describe("equipment list query", () => {
  it("leaves the address clean when nothing is filtered", () => {
    expect(equipmentQuery(EMPTY_FILTERS, DEFAULT_SORT)).toBe("");
    expect(equipmentFromQuery(new URLSearchParams())).toEqual({
      filters: EMPTY_FILTERS,
      sort: DEFAULT_SORT,
    });
  });

  it("round-trips every filter and the sort order", () => {
    const filters = {
      ...EMPTY_FILTERS,
      search: "av. rio",
      type: "camera" as const,
      statuses: ["malfunction" as const, "stolen" as const],
      regionId: "south",
      neighborhoodId: "fragata",
      agency: "3",
      maintenance: "urgent" as const,
    };
    const sort = { key: "seen" as const, direction: -1 as const };
    const query = equipmentQuery(filters, sort);
    expect(query).toContain("type=camera");
    expect(query).toContain("sort=seen-desc");
    expect(equipmentFromQuery(new URLSearchParams(query))).toEqual({ filters, sort });
  });

  it("ignores values it does not know", () => {
    const parsed = equipmentFromQuery(
      new URLSearchParams(
        "type=foguete&status=operational,quebrado&sort=x&maintenance=y&agency=mobility",
      ),
    );
    expect(parsed.filters.type).toBe("");
    expect(parsed.filters.statuses).toEqual(["operational"]);
    expect(parsed.filters.maintenance).toBe("");
    expect(parsed.filters.agency).toBe("");
    expect(parsed.sort).toEqual(DEFAULT_SORT);
  });
});

describe("agent list query", () => {
  it("round-trips the filters and drops invalid ones", () => {
    const filters = {
      ...EMPTY_AGENT_FILTERS,
      search: "ana",
      role: "municipal_guard" as const,
      status: "available" as const,
      regionId: "center",
    };
    expect(agentFromQuery(new URLSearchParams(agentQuery(filters)))).toEqual(filters);
    expect(agentQuery(EMPTY_AGENT_FILTERS)).toBe("");
    expect(agentFromQuery(new URLSearchParams("role=bombeiro")).role).toBe("");
  });
});

describe("map view in the address", () => {
  it("adds and removes the map flag without touching the filters", () => {
    const withMap = withMapView("?type=camera", true);
    expect(withMap).toBe("?type=camera&view=map");
    expect(showsMapView(new URLSearchParams(withMap))).toBe(true);
    expect(withoutMapView(withMap)).toBe("?type=camera");
  });

  it("keeps the address clean when the map is off", () => {
    expect(withMapView("", false)).toBe("");
    expect(withMapView("", true)).toBe("?view=map");
    expect(withoutMapView("?view=map")).toBe("");
    expect(showsMapView(new URLSearchParams("?view=list"))).toBe(false);
  });
});

describe("searchQuery", () => {
  it("keeps only a filled search term", () => {
    expect(searchQuery("")).toBe("");
    expect(searchQuery("guarda civil")).toBe("?search=guarda+civil");
  });
});
