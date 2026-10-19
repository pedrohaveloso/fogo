import { describe, expect, it } from "vitest";
import { distanceKm } from "../shared/geo.ts";
import {
  advance,
  createRoadNetwork,
  placeOnRoad,
  setDestination,
  type RoadData,
  type TravelMode,
} from "./roads.ts";

const SECOND = 1000;
const CAR: TravelMode = { kmh: 60, followsOneWay: true, limitFactor: 1 };
const SIREN: TravelMode = { kmh: 60, followsOneWay: true, limitFactor: 1.2 };
const WALK: TravelMode = { kmh: 4.5, followsOneWay: false, limitFactor: Number.POSITIVE_INFINITY };

const DATA: RoadData = {
  source: "test",
  generatedAt: "2026-10-14T00:00:00.000Z",
  nodes: [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0, 0.001],
    [0.002, 0.001],
    [0.003, 0],
    [0.01, 0.01],
  ],
  edges: [
    [0, 1, 10, 0],
    [1, 2, 30, 1],
    [0, 3, 30, 0],
    [3, 4, 60, 0],
    [4, 2, 30, 0],
    [2, 5, 30, 1],
  ],
};

const network = createRoadNetwork(DATA);
const block = distanceKm([0, 0], [0.001, 0]);

describe("road network", () => {
  it("finds the nearest node and the nodes within a radius", () => {
    expect(network.nearestNode([0.0019, 0.0011])).toBe(4);
    expect(network.nearestNode([0.0099, 0.0102])).toBe(6);
    expect(network.nodesWithin([0, 0], block * 1.1).toSorted()).toEqual([0, 1, 3]);
    expect(network.nodesWithin([0.5, 0.5], 0.1)).toEqual([]);
  });

  it("fails to snap when there are no roads", () => {
    const empty = createRoadNetwork({ ...DATA, nodes: [], edges: [] });
    expect(() => empty.nearestNode([0, 0])).toThrow("Malha viária vazia");
  });

  it("routes vehicles through the fastest streets and pedestrians through the shortest", () => {
    expect(network.route(0, 2, CAR)).toEqual([0, 3, 4, 2]);
    expect(network.route(0, 2, WALK)).toEqual([0, 1, 2]);
  });

  it("keeps vehicles out of one-way streets in the wrong direction", () => {
    expect(network.route(2, 0, CAR)).toEqual([2, 4, 3, 0]);
    expect(network.route(2, 0, WALK)).toEqual([2, 1, 0]);
  });

  it("ignores one-way rules when they leave no way out", () => {
    const route = network.route(5, 0, CAR);
    expect(route.slice(0, 2)).toEqual([5, 2]);
    expect(route.at(-1)).toBe(0);
  });

  it("stays put when the destination is unreachable or is the origin", () => {
    expect(network.route(0, 6, CAR)).toEqual([0]);
    expect(network.route(3, 3, CAR)).toEqual([3]);
  });

  it("caps speed by the street limit unless the mode may exceed it", () => {
    expect(network.kmhBetween(0, 3, CAR)).toBe(30);
    expect(network.kmhBetween(0, 3, SIREN)).toBe(36);
    expect(network.kmhBetween(3, 4, SIREN)).toBe(60);
    expect(network.kmhBetween(0, 3, WALK)).toBe(4.5);
    expect(network.kmhBetween(0, 4, CAR)).toBe(60);
  });
});

describe("journeys", () => {
  it("snaps a free position onto the closest road node", () => {
    const journey = placeOnRoad(network, [0.0021, 0.0009]);
    expect(journey).toEqual({ from: 4, path: [], position: [0.002, 0.001], destination: 4 });
  });

  it("moves along the route at the street speed and stops at the destination", () => {
    const journey = placeOnRoad(network, [0, 0]);
    setDestination(network, journey, 2, CAR);
    expect(journey.path).toEqual([3, 4, 2]);

    const first = advance(network, journey, CAR, 6 * SECOND);
    expect(first).toBeCloseTo((30 * 6) / 3600, 6);
    expect(journey.position[0]).toBe(0);
    expect(journey.position[1]).toBeGreaterThan(0);
    expect(journey.path).toEqual([3, 4, 2]);

    const rest = advance(network, journey, CAR, 60 * SECOND);
    expect(first + rest).toBeCloseTo(block * 4, 6);
    expect(journey).toMatchObject({ from: 2, path: [], position: [0.002, 0] });
    expect(advance(network, journey, CAR, 60 * SECOND)).toBe(0);
  });

  it("finishes the current block before turning to a new destination", () => {
    const journey = placeOnRoad(network, [0, 0]);
    setDestination(network, journey, 4, CAR);
    advance(network, journey, CAR, 3 * SECOND);
    setDestination(network, journey, 1, CAR);
    expect(journey.path).toEqual([3, 0, 1]);
    expect(journey.destination).toBe(1);
  });

  it("walks at walking pace", () => {
    const journey = placeOnRoad(network, [0, 0]);
    setDestination(network, journey, 2, WALK);
    expect(advance(network, journey, WALK, 60 * SECOND)).toBeCloseTo(4.5 / 60, 6);
  });
});
