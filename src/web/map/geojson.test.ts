import { describe, expect, it } from "vitest";
import type { AreaHealth } from "../../shared/types.ts";
import { makeAgent, makeOccurrence } from "../../server/test-fixtures.ts";
import { dispatchLines, idFilter, idsAtLevel, neighborhoodFeatures } from "./geojson.ts";

function area(id: string, level: AreaHealth["level"]): AreaHealth {
  return {
    id,
    name: id,
    equipmentTotal: 0,
    operational: 0,
    unavailable: 0,
    availabilityPct: 100,
    openOccurrences: 0,
    severeOccurrences: 0,
    agentsActive: 0,
    level,
    reasons: [],
  };
}

describe("dispatchLines", () => {
  it("links each responding agent to the occurrence it is heading to", () => {
    const occurrence = makeOccurrence({ id: 7, lat: -22.2, lng: -49.9 });
    const agent = makeAgent({
      id: 3,
      status: "responding",
      occurrenceId: 7,
      lat: -22.21,
      lng: -49.95,
    });
    expect(dispatchLines([agent], [occurrence]).features).toEqual([
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-49.95, -22.21],
            [-49.9, -22.2],
          ],
        },
        properties: { agentId: 3, occurrenceId: 7 },
      },
    ]);
  });

  it("skips agents that are not responding or whose occurrence is not on the map", () => {
    const occurrence = makeOccurrence({ id: 7 });
    const agents = [
      makeAgent({ id: 1, status: "available", occurrenceId: 7 }),
      makeAgent({ id: 2, status: "responding", occurrenceId: 99 }),
      makeAgent({ id: 3, status: "responding", occurrenceId: null }),
    ];
    expect(dispatchLines(agents, [occurrence]).features).toEqual([]);
    expect(dispatchLines([], []).features).toEqual([]);
  });
});

describe("idsAtLevel and idFilter", () => {
  it("selects the areas at a health level and builds a layer filter for them", () => {
    const areas = [
      area("centro", "critical"),
      area("fragata", "attention"),
      area("alto", "critical"),
    ];
    expect(idsAtLevel(areas, "critical")).toEqual(["centro", "alto"]);
    expect(idsAtLevel(areas, "normal")).toEqual([]);
    expect(idFilter(["centro"])).toEqual(["in", ["get", "id"], ["literal", ["centro"]]]);
    expect(idFilter([])).toEqual(["in", ["get", "id"], ["literal", []]]);
  });
});

describe("neighborhoodFeatures", () => {
  it("closes each polygon ring and drops shapes with fewer than three points", () => {
    const features = neighborhoodFeatures([
      {
        id: "centro",
        name: "Centro",
        regionId: "center",
        lat: 0,
        lng: 0,
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      { id: "vazio", name: "Vazio", regionId: "center", lat: 0, lng: 0, polygon: [[0, 0]] },
    ]).features;
    expect(features).toHaveLength(1);
    expect(features[0]?.geometry.coordinates[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });
});
