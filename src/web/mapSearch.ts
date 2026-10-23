import { AGENT_ROLES, EQUIPMENT_TYPES } from "../shared/catalog.ts";
import type { Agent, Equipment } from "../shared/types.ts";

export type SearchResult = {
  kind: "equipment" | "agent";
  id: number;
  title: string;
  detail: string;
  lat: number;
  lng: number;
};

export const SEARCH_LIMIT = 8;

export function searchResults(
  equipment: readonly Equipment[],
  agents: readonly Agent[],
  search: string,
): SearchResult[] {
  const term = search.trim().toLowerCase();
  if (!term) {
    return [];
  }
  const agentHits = agents
    .filter(
      (agent) =>
        agent.name.toLowerCase().includes(term) || agent.badge.toLowerCase().includes(term),
    )
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
  return [...agentHits, ...equipmentHits].slice(0, SEARCH_LIMIT);
}
