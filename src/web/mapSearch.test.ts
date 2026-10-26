import { describe, expect, it } from "vitest";
import { makeAgent, makeEquipment } from "../server/test-fixtures.ts";
import type { StreetPlace } from "../shared/types.ts";
import { SEARCH_LIMIT, STREET_LIMIT, searchResults } from "./mapSearch.ts";

describe("searchResults", () => {
  const equipment = [makeEquipment({ id: 1, serialNumber: "CAM-1" })];
  const agents = [
    makeAgent({ id: 7, name: "Ana Almeida", badge: "AT-10" }),
    makeAgent({ id: 8, name: "Bruno Lima", badge: "PM-20" }),
    makeAgent({ id: 9, name: "João Paraná", badge: "GM-30" }),
  ];
  const streets: StreetPlace[] = [
    { name: "Rua São José", lat: -22.2, lng: -49.9, neighborhoodId: "centro" },
    { name: "Avenida Sampaio Vidal", lat: -22.21, lng: -49.94, neighborhoodId: "centro" },
  ];
  const names = new Map([["centro", "Centro"]]);

  it("returns nothing for an empty search", () => {
    expect(searchResults(equipment, agents, streets, names, "   ")).toEqual([]);
  });

  it("lists the filtered equipment and agents matching name or badge", () => {
    const results = searchResults(equipment, agents, streets, names, " pm-2 ");
    expect(results.map((item) => `${item.kind}-${item.id}`)).toEqual(["agent-8", "equipment-1"]);
    expect(results[0]).toMatchObject({ title: "Bruno Lima" });
  });

  it("finds streets without accents and puts them first", () => {
    const results = searchResults([], agents, streets, names, "sao jose");
    expect(results).toEqual([
      {
        kind: "street",
        id: 0,
        title: "Rua São José",
        detail: "Centro",
        lat: -22.2,
        lng: -49.9,
      },
    ]);
  });

  it("ignores accents in agent names", () => {
    expect(searchResults([], agents, [], names, "joao parana")[0]).toMatchObject({ id: 9 });
  });

  it("stops at the limits", () => {
    const many = Array.from({ length: 20 }, (_, id) => makeEquipment({ id }));
    const manyStreets = Array.from({ length: 10 }, (_, index) => ({
      ...streets[0]!,
      name: `Rua X ${index}`,
    }));
    const results = searchResults(many, agents, manyStreets, names, "x");
    expect(results).toHaveLength(SEARCH_LIMIT);
    expect(results.filter((item) => item.kind === "street")).toHaveLength(STREET_LIMIT);
  });
});
