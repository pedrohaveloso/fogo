import { plural } from "../../shared/text.ts";
import {
  ACTIVE_AGENT_STATUSES,
  OCCURRENCE_KINDS,
  OCCURRENCE_KIND_KEYS,
  regionWith,
} from "../../shared/catalog.ts";
import { HOUR, localParts, startOfHour } from "../../shared/time.ts";
import type {
  Agent,
  CityDataset,
  StaffingPlan,
  StaffingRecommendation,
} from "../../shared/types.ts";
import type { RiskModel } from "./risk.ts";

const TARGET_UTILIZATION = 0.4;
const PEAK_WINDOW_HOURS = 2;

function formatWindow(startMs: number, hours: number): string {
  const from = localParts(startMs).hour;
  const to = (from + hours) % 24;
  return `${String(from).padStart(2, "0")}h–${String(to).padStart(2, "0")}h`;
}

export function planStaffing(
  model: RiskModel,
  city: CityDataset,
  agents: readonly Agent[],
  now: number,
  horizonHours: number,
): StaffingPlan {
  const start = startOfHour(now);
  const regionOfNeighborhood = new Map(city.neighborhoods.map((item) => [item.id, item.regionId]));
  const active = agents.filter((agent) => ACTIVE_AGENT_STATUSES.includes(agent.status));
  const totalActive = active.length;

  const demand = city.regions.map((region) => {
    const members = city.neighborhoods.filter((item) => item.regionId === region.id);
    const hourly = Array.from({ length: horizonHours }, () => 0);
    let workloadHours = 0;
    let weighted = 0;
    for (let offset = 0; offset < horizonHours; offset += 1) {
      const ms = start + offset * HOUR;
      for (const neighborhood of members) {
        for (const kind of OCCURRENCE_KIND_KEYS) {
          const expected = model.expected(neighborhood.id, kind, ms);
          hourly[offset]! += expected;
          workloadHours += (expected * OCCURRENCE_KINDS[kind].handlingMinutes) / 60;
          weighted += expected * OCCURRENCE_KINDS[kind].severityWeight;
        }
      }
    }
    const activeAgents = active.filter(
      (agent) => regionOfNeighborhood.get(agent.baseNeighborhoodId) === region.id,
    ).length;
    return { region, hourly, workloadHours, weighted, activeAgents };
  });

  const totalWeighted = demand.reduce((sum, item) => sum + item.weighted, 0);
  const regions: StaffingRecommendation[] = demand.map((item) => {
    const window = Math.min(PEAK_WINDOW_HOURS, horizonHours);
    let peakOffset = 0;
    let peakValue = -1;
    for (let offset = 0; offset + window <= horizonHours; offset += 1) {
      const value = item.hourly.slice(offset, offset + window).reduce((sum, v) => sum + v, 0);
      if (value > peakValue) {
        peakValue = value;
        peakOffset = offset;
      }
    }
    const byWorkload = Math.ceil(item.workloadHours / (horizonHours * TARGET_UTILIZATION));
    const proportional =
      totalWeighted === 0 ? 0 : Math.round((totalActive * item.weighted) / totalWeighted);
    const requiredAgents = Math.max(1, byWorkload, proportional);
    const gap = requiredAgents - item.activeAgents;
    const peakWindow = formatWindow(start + peakOffset * HOUR, window);
    const action =
      gap > 0
        ? `Deslocar ${gap} ${plural(gap, "agente", "agentes")} ${regionWith("para", item.region.name)}, com prioridade entre ${peakWindow}.`
        : gap < 0
          ? `Folga de ${-gap} ${plural(-gap, "agente", "agentes")}; ${-gap === 1 ? "pode" : "podem"} apoiar regiões com déficit.`
          : "Efetivo adequado para a demanda prevista.";
    return {
      regionId: item.region.id,
      regionName: item.region.name,
      expectedOccurrences: item.hourly.reduce((sum, value) => sum + value, 0),
      workloadHours: item.workloadHours,
      requiredAgents,
      activeAgents: item.activeAgents,
      gap,
      peakWindow,
      action,
    };
  });

  const deficits = regions
    .filter((item) => item.gap > 0)
    .map((item) => ({ id: item.regionId, need: item.gap }));
  const surpluses = regions
    .filter((item) => item.gap < 0)
    .map((item) => ({ id: item.regionId, spare: -item.gap }))
    .sort((a, b) => b.spare - a.spare);
  const moves: StaffingPlan["moves"] = [];
  for (const deficit of deficits.sort((a, b) => b.need - a.need)) {
    for (const surplus of surpluses) {
      if (deficit.need === 0) {
        break;
      }
      const amount = Math.min(deficit.need, surplus.spare);
      if (amount > 0) {
        moves.push({ fromRegionId: surplus.id, toRegionId: deficit.id, agents: amount });
        deficit.need -= amount;
        surplus.spare -= amount;
      }
    }
  }

  return { generatedAt: new Date(now).toISOString(), horizonHours, regions, moves };
}
