import { describe, expect, it } from "vitest";
import { EMPTY_AGENT_FILTERS } from "./agentFilters.ts";
import { EMPTY_FILTERS } from "./components/OperationsFilters.tsx";
import {
  DEFAULT_SORT,
  agentFromQuery,
  agentQuery,
  equipmentFromQuery,
  equipmentQuery,
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
      agency: "mobility" as const,
      maintenance: "urgent" as const,
    };
    const sort = { key: "seen" as const, direction: -1 as const };
    const query = equipmentQuery(filters, sort);
    expect(query).toContain("tipo=camera");
    expect(query).toContain("ordem=seen-desc");
    expect(equipmentFromQuery(new URLSearchParams(query))).toEqual({ filters, sort });
  });

  it("ignores values it does not know", () => {
    const parsed = equipmentFromQuery(
      new URLSearchParams("tipo=foguete&situacao=operational,quebrado&ordem=x&manutencao=y"),
    );
    expect(parsed.filters.type).toBe("");
    expect(parsed.filters.statuses).toEqual(["operational"]);
    expect(parsed.filters.maintenance).toBe("");
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
    expect(agentFromQuery(new URLSearchParams("funcao=bombeiro")).role).toBe("");
  });
});
