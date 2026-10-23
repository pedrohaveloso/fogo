import {
  AGENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  UNAVAILABLE_STATUSES,
  type AgentStatus,
  type EquipmentType,
} from "../shared/catalog.ts";
import type { Agent, Equipment, Kpis } from "../shared/types.ts";
import { formatInteger, formatPercent } from "./format.ts";

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

export type Indicator = { key: string; value: string; label: string };

function counted(key: string, count: number, singular: string, plural: string): Indicator {
  return { key, value: formatInteger(count), label: count === 1 ? singular : plural };
}

export function generalIndicators(kpis: Kpis): Indicator[] {
  return [
    counted("total", kpis.equipmentTotal, "equipamento", "equipamentos"),
    counted("operational", kpis.operational, "operacional", "operacionais"),
    counted("unavailable", kpis.unavailable, "indisponível", "indisponíveis"),
    {
      key: "availability",
      value: formatPercent(kpis.availabilityPct),
      label: "de disponibilidade",
    },
    counted("agents", kpis.agentsActive, "agente em atividade", "agentes em atividade"),
    ...(kpis.silent > 0
      ? [counted("silent", kpis.silent, "sem comunicação", "sem comunicação")]
      : []),
  ];
}
