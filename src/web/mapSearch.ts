import { AGENT_ROLES, EQUIPMENT_TYPES } from "../shared/catalog.ts";
import { fold } from "../shared/text.ts";
import type { Agent, Equipment, StreetPlace } from "../shared/types.ts";

export type SearchResult = {
  kind: "equipment" | "agent" | "street";
  id: number;
  title: string;
  detail: string;
  lat: number;
  lng: number;
};

export const SEARCH_LIMIT = 8;
export const STREET_LIMIT = 3;

export function searchResults(
  equipment: readonly Equipment[],
  agents: readonly Agent[],
  streets: readonly StreetPlace[],
  neighborhoodNames: ReadonlyMap<string, string>,
  search: string,
): SearchResult[] {
  const term = fold(search);
  if (!term) {
    return [];
  }
  const streetHits = streets
    .flatMap((street, index): SearchResult[] =>
      fold(street.name).includes(term)
        ? [
            {
              kind: "street",
              id: index,
              title: street.name,
              detail: neighborhoodNames.get(street.neighborhoodId) ?? "",
              lat: street.lat,
              lng: street.lng,
            },
          ]
        : [],
    )
    .slice(0, STREET_LIMIT);
  const agentHits = agents
    .filter((agent) => fold(agent.name).includes(term) || fold(agent.badge).includes(term))
    .map((agent): SearchResult => ({
      kind: "agent",
      id: agent.id,
      title: agent.name,
      detail: `${AGENT_ROLES[agent.role].label}, ${agent.badge}`,
      lat: agent.lat,
      lng: agent.lng,
    }));
  const equipmentHits = equipment.map((item): SearchResult => ({
    kind: "equipment",
    id: item.id,
    title: item.serialNumber,
    detail: `${EQUIPMENT_TYPES[item.type].label}, ${item.street}`,
    lat: item.currentLat ?? item.lat,
    lng: item.currentLng ?? item.lng,
  }));
  return [...streetHits, ...agentHits, ...equipmentHits].slice(0, SEARCH_LIMIT);
}
