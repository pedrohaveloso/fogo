import { AGENT_STATUSES, type AgentRole, type AgentStatus } from "../shared/catalog.ts";
import { fold } from "../shared/text.ts";
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
  const term = fold(filters.search);
  return !term || fold(agent.name).includes(term) || fold(agent.badge).includes(term);
}

export function compareAgents(a: Agent, b: Agent): number {
  return (
    AGENT_STATUSES.indexOf(a.status) - AGENT_STATUSES.indexOf(b.status) ||
    a.name.localeCompare(b.name, "pt-BR")
  );
}
