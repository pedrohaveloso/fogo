import { readFileSync } from "node:fs";
import dataset from "../../../data/marilia.json" with { type: "json" };
import type { LngLat } from "../../shared/geo.ts";
import type { Neighborhood, PointOfInterest, Region, Street } from "../../shared/types.ts";
import { createRoadNetwork, type RoadData } from "../roads.ts";

export type CitySource = {
  source: string;
  generatedAt: string;
  city: { name: string; uf: string; center: LngLat; boundary: LngLat[] };
  regions: (Region & { polygon: LngLat[] })[];
  neighborhoods: Neighborhood[];
  streets: Street[];
  pois: PointOfInterest[];
};

export const MARILIA_IBGE_CODE = 3529005;

export const marilia = dataset as CitySource;

export function loadMariliaRoads() {
  return createRoadNetwork(
    JSON.parse(
      readFileSync(new URL("../../../data/marilia-roads.json", import.meta.url), "utf8"),
    ) as RoadData,
  );
}
