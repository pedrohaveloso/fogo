import type { AgentRole, AgentStatus } from "../shared/catalog.ts";
import type { Agent } from "../shared/types.ts";

export type AgentFilters = {
  search: string;
  role: AgentRole | "";
  status: AgentStatus | "";
  regionId: string;
};

export const EMPTY_AGENT_FILTERS: AgentFilters = { search: "", role: "", status: "", regionId: "" };

export function matchesAgentFilters(
  agent: Agent,
  filters: AgentFilters,
  regionOf: ReadonlyMap<string, string>,
): boolean {
  if (filters.role && agent.role !== filters.role) {
    return false;
  }
  if (filters.status && agent.status !== filters.status) {
    return false;
  }
  if (filters.regionId && regionOf.get(agent.baseNeighborhoodId) !== filters.regionId) {
    return false;
  }
  const term = filters.search.trim().toLowerCase();
  return (
    !term || agent.name.toLowerCase().includes(term) || agent.badge.toLowerCase().includes(term)
  );
}
