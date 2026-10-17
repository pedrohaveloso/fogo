import type { Agent, Equipment, Occurrence } from "../shared/types.ts";

export const NOW = Date.parse("2026-10-14T15:00:00.000Z");

export function makeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: 1,
    type: "camera",
    serialNumber: "CAM-TEST-1",
    brand: "Visium",
    model: "VS-1",
    agency: "municipal_guard",
    status: "operational",
    cep: "17500-000",
    street: "Avenida Sampaio Vidal",
    reference: "número 100",
    neighborhoodId: "centro",
    city: "Marília",
    uf: "SP",
    lat: -22.2139,
    lng: -49.9458,
    currentLat: null,
    currentLng: null,
    maintenanceNeed: "scheduled",
    maintenanceIntervalDays: 120,
    lastMaintenanceAt: "2026-09-01",
    nextMaintenanceAt: "2026-12-30",
    maintenanceNotes: "",
    attributes: {},
    installedAt: "2025-01-10",
    lastSeenAt: new Date(NOW - 10_000).toISOString(),
    battery: null,
    createdAt: new Date(NOW - 86_400_000).toISOString(),
    updatedAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides,
  };
}

export function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    name: "Ana Teste",
    badge: "AT-1",
    role: "traffic_agent",
    agency: "mobility",
    rank: "",
    phone: "",
    shift: "afternoon",
    status: "available",
    baseName: "Base Centro",
    baseNeighborhoodId: "centro",
    lat: -22.2139,
    lng: -49.9458,
    vehicleId: null,
    occurrenceId: null,
    lastSeenAt: new Date(NOW).toISOString(),
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

export function makeOccurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 1,
    kind: "accident",
    severity: 2,
    status: "open",
    neighborhoodId: "centro",
    lat: -22.2139,
    lng: -49.9458,
    description: "Colisão",
    equipmentId: null,
    agentId: null,
    createdAt: new Date(NOW - 60_000).toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}
