import { distanceKm, type LngLat } from "./geo.ts";
import type { Agent, Equipment } from "./types.ts";

const FOOT_KMH = 7;
const CAR_KMH = 60;
const MOTORCYCLE_KMH = 65;
const ROUTE_DETOUR = 1.3;

export type AgentArrival = { agent: Agent; minutes: number };

function responseKmh(vehicle: Equipment | undefined): number {
  if (vehicle?.status !== "operational") {
    return FOOT_KMH;
  }
  return vehicle.type === "agent_motorcycle" || vehicle.attributes["vehicleKind"] === "motorcycle"
    ? MOTORCYCLE_KMH
    : CAR_KMH;
}

export function nearestAvailableAgents(
  agents: Agent[],
  equipment: Equipment[],
  target: LngLat,
  limit: number,
): AgentArrival[] {
  const vehicles = new Map(equipment.map((item) => [item.id, item]));
  return agents
    .filter((agent) => agent.status === "available")
    .map((agent) => {
      const vehicle = agent.vehicleId === null ? undefined : vehicles.get(agent.vehicleId);
      const km = distanceKm([agent.lng, agent.lat], target) * ROUTE_DETOUR;
      return { agent, minutes: Math.max(1, Math.round((km / responseKmh(vehicle)) * 60)) };
    })
    .toSorted((a, b) => a.minutes - b.minutes || a.agent.name.localeCompare(b.agent.name, "pt-BR"))
    .slice(0, limit);
}
