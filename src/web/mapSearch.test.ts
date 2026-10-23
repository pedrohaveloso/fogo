import { describe, expect, it } from "vitest";
import { makeAgent, makeEquipment } from "../server/test-fixtures.ts";
import { SEARCH_LIMIT, searchResults } from "./mapSearch.ts";

describe("searchResults", () => {
  const equipment = [makeEquipment({ id: 1, serialNumber: "CAM-1" })];
  const agents = [
    makeAgent({ id: 7, name: "Ana Almeida", badge: "AT-10" }),
    makeAgent({ id: 8, name: "Bruno Lima", badge: "PM-20" }),
  ];

  it("returns nothing for an empty search", () => {
    expect(searchResults(equipment, agents, "   ")).toEqual([]);
  });

  it("lists the filtered equipment and agents matching name or badge", () => {
    const results = searchResults(equipment, agents, " pm-2 ");
    expect(results.map((item) => `${item.kind}-${item.id}`)).toEqual(["agent-8", "equipment-1"]);
    expect(results[0]).toMatchObject({ title: "Bruno Lima" });
  });

  it("stops at the limit", () => {
    const many = Array.from({ length: 20 }, (_, id) => makeEquipment({ id }));
    expect(searchResults(many, agents, "x")).toHaveLength(SEARCH_LIMIT);
  });
});
