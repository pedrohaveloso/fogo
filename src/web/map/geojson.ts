import type { Neighborhood } from "../../shared/types.ts";

export function neighborhoodFeatures(neighborhoods: readonly Neighborhood[]) {
  return {
    type: "FeatureCollection" as const,
    features: neighborhoods
      .filter((item) => item.polygon.length >= 3)
      .map((item) => ({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [[...item.polygon, item.polygon[0]!]] },
        properties: { id: item.id, name: item.name },
      })),
  };
}
