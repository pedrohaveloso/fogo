import type { FilterSpecification } from "maplibre-gl";
import type {
  Agent,
  AreaHealth,
  HealthLevel,
  Neighborhood,
  Occurrence,
} from "../../shared/types.ts";

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

export function dispatchLines(agents: readonly Agent[], occurrences: readonly Occurrence[]) {
  const byId = new Map(occurrences.map((item) => [item.id, item]));
  return {
    type: "FeatureCollection" as const,
    features: agents.flatMap((agent) => {
      const target =
        agent.status === "responding" && agent.occurrenceId !== null
          ? byId.get(agent.occurrenceId)
          : undefined;
      return target
        ? [
            {
              type: "Feature" as const,
              geometry: {
                type: "LineString" as const,
                coordinates: [
                  [agent.lng, agent.lat],
                  [target.lng, target.lat],
                ],
              },
              properties: { agentId: agent.id, occurrenceId: target.id },
            },
          ]
        : [];
    }),
  };
}

export function idsAtLevel(areas: readonly AreaHealth[], level: HealthLevel): string[] {
  return areas.filter((area) => area.level === level).map((area) => area.id);
}

export function idFilter(ids: readonly string[]): FilterSpecification {
  return ["in", ["get", "id"], ["literal", [...ids]]];
}
