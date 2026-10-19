import {
  AGENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  UNAVAILABLE_STATUSES,
  type AgentStatus,
  type EquipmentType,
} from "../shared/catalog.ts";
import type { Agent, Equipment } from "../shared/types.ts";

export type FleetEntry = { type: EquipmentType; total: number; down: number };

export function fleetSummary(equipment: readonly Equipment[]): FleetEntry[] {
  return EQUIPMENT_TYPE_KEYS.map((type) => {
    const items = equipment.filter((item) => item.type === type);
    return {
      type,
      total: items.length,
      down: items.filter((item) => UNAVAILABLE_STATUSES.includes(item.status)).length,
    };
  });
}

export function agentStatusCounts(agents: readonly Agent[]): Record<AgentStatus, number> {
  const counts = Object.fromEntries(AGENT_STATUSES.map((status) => [status, 0])) as Record<
    AgentStatus,
    number
  >;
  for (const agent of agents) {
    counts[agent.status] += 1;
  }
  return counts;
}
