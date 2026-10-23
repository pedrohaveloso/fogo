import {
  ACTIVE_AGENT_STATUSES,
  AVAILABILITY_ATTENTION_PCT,
  AVAILABILITY_CRITICAL_PCT,
  EQUIPMENT_TYPES,
  OCCURRENCE_KINDS,
  SEVERITY_LABELS,
  countsTowardAvailability,
  type EquipmentType,
} from "../shared/catalog.ts";
import {
  MAINTENANCE_SOON_DAYS,
  maintenanceDaysLeft,
  maintenanceState,
} from "../shared/maintenance.ts";
import { MINUTE } from "../shared/time.ts";
import { plural } from "../shared/text.ts";
import type {
  Agent,
  Alert,
  AlertLevel,
  Anomaly,
  AreaHealth,
  CityDataset,
  CityHealth,
  Equipment,
  HealthLevel,
  Kpis,
  Occurrence,
  OperationsSummary,
  StaffingPlan,
} from "../shared/types.ts";
import { nearestNeighborhood } from "./city.ts";

export const HEARTBEAT_WARNING_MINUTES = 3;
export const HEARTBEAT_CRITICAL_MINUTES = 15;
export const STALE_CRITICAL_MS = 24 * 60 * MINUTE;

const SAFETY_CRITICAL: ReadonlySet<EquipmentType> = new Set([
  "smart_traffic_light",
  "radar",
  "camera",
]);

export type OperationsInput = {
  city: CityDataset;
  equipment: Equipment[];
  agents: Agent[];
  occurrences: Occurrence[];
  anomalies: Anomaly[];
  staffing: StaffingPlan | null;
  acknowledged: ReadonlySet<string>;
  now: number;
};

function minutesSince(iso: string | null, now: number): number {
  return iso === null ? Number.POSITIVE_INFINITY : (now - Date.parse(iso)) / MINUTE;
}

export function equipmentLabel(item: Equipment): string {
  return `${EQUIPMENT_TYPES[item.type].label} ${item.serialNumber}`;
}

export function computeKpis(input: OperationsInput, alerts: Alert[]): Kpis {
  const { equipment, agents, occurrences, now } = input;
  const countable = equipment.filter((item) => countsTowardAvailability(item.status));
  const operational = countable.filter((item) => item.status === "operational").length;
  const states = equipment.map((item) => maintenanceState(item, now));
  return {
    equipmentTotal: equipment.length,
    operational,
    unavailable: countable.length - operational,
    notInstalled: equipment.filter((item) => item.status === "not_installed").length,
    disabled: equipment.filter((item) => item.status === "disabled").length,
    availabilityPct: countable.length === 0 ? 100 : (operational / countable.length) * 100,
    agentsActive: agents.filter((agent) => ACTIVE_AGENT_STATUSES.includes(agent.status)).length,
    agentsOnDuty: agents.filter((agent) => agent.status !== "off_duty").length,
    agentsTotal: agents.length,
    openOccurrences: occurrences.filter((item) => item.status !== "resolved").length,
    criticalAlerts: alerts.filter((alert) => alert.level === "critical" && !alert.acknowledged)
      .length,
    maintenanceUrgent: states.filter((state) => state === "urgent").length,
    maintenanceSoon: states.filter((state) => state === "soon").length,
  };
}

type AreaLimits = { openAttention: number; severeAttention: number };

const NEIGHBORHOOD_LIMITS: AreaLimits = { openAttention: 3, severeAttention: 2 };
const REGION_LIMITS: AreaLimits = { openAttention: 10, severeAttention: 4 };

function occurrencesPhrase(count: number, singular: string, pluralForm: string, tail: string) {
  return `${count} ${plural(count, singular, pluralForm)} ${tail}`;
}

function healthOf(
  id: string,
  name: string,
  equipment: Equipment[],
  occurrences: Occurrence[],
  agentsActive: number,
  limits: AreaLimits,
): AreaHealth {
  const countable = equipment.filter((item) => countsTowardAvailability(item.status));
  const operational = countable.filter((item) => item.status === "operational").length;
  const availabilityPct = countable.length === 0 ? 100 : (operational / countable.length) * 100;
  const open = occurrences.filter((item) => item.status !== "resolved");
  const severe = open.filter((item) => item.severity >= 3);
  const severeWaiting = severe.filter((item) => item.status === "open");
  const criticalWaiting = severeWaiting.filter((item) => item.severity === 4);
  const reasons: string[] = [];
  let level: HealthLevel = "normal";
  const raise = (to: HealthLevel) => {
    if (to === "critical" || (to === "attention" && level === "normal")) {
      level = to;
    }
  };

  if (countable.length >= 3 && availabilityPct < AVAILABILITY_CRITICAL_PCT) {
    raise("critical");
    reasons.push(`Disponibilidade de equipamentos em ${availabilityPct.toFixed(0)}%`);
  } else if (countable.length >= 2 && availabilityPct < AVAILABILITY_ATTENTION_PCT) {
    raise("attention");
    reasons.push(`Disponibilidade de equipamentos em ${availabilityPct.toFixed(0)}%`);
  }
  if (criticalWaiting.length > 0 || severeWaiting.length >= 2) {
    raise("critical");
    reasons.push(
      occurrencesPhrase(
        severeWaiting.length,
        "ocorrência grave",
        "ocorrências graves",
        "sem equipe",
      ),
    );
  } else if (severeWaiting.length === 1) {
    raise("attention");
    reasons.push("1 ocorrência grave sem equipe");
  }
  const severeHandled = severe.length - severeWaiting.length;
  if (severeHandled >= limits.severeAttention) {
    raise("attention");
    reasons.push(
      occurrencesPhrase(severeHandled, "ocorrência grave", "ocorrências graves", "em atendimento"),
    );
  } else if (open.length >= limits.openAttention) {
    raise("attention");
    reasons.push(`${open.length} ocorrências em aberto`);
  }

  return {
    id,
    name,
    equipmentTotal: equipment.length,
    operational,
    unavailable: countable.length - operational,
    availabilityPct,
    openOccurrences: open.length,
    severeOccurrences: severe.length,
    agentsActive,
    level,
    reasons,
  };
}

export function computeAreaHealth(input: OperationsInput): {
  neighborhoods: AreaHealth[];
  regions: AreaHealth[];
} {
  const { city, equipment, agents, occurrences } = input;
  const agentNeighborhood = new Map<number, string>();
  for (const agent of agents) {
    if (ACTIVE_AGENT_STATUSES.includes(agent.status)) {
      agentNeighborhood.set(agent.id, nearestNeighborhood([agent.lng, agent.lat]).id);
    }
  }
  const countAgents = (ids: ReadonlySet<string>) =>
    [...agentNeighborhood.values()].filter((id) => ids.has(id)).length;

  const neighborhoods = city.neighborhoods.map((neighborhood) =>
    healthOf(
      neighborhood.id,
      neighborhood.name,
      equipment.filter((item) => item.neighborhoodId === neighborhood.id),
      occurrences.filter((item) => item.neighborhoodId === neighborhood.id),
      countAgents(new Set([neighborhood.id])),
      NEIGHBORHOOD_LIMITS,
    ),
  );

  const regions = city.regions.map((region) => {
    const members = new Set(
      city.neighborhoods.filter((item) => item.regionId === region.id).map((item) => item.id),
    );
    const health = healthOf(
      region.id,
      region.name,
      equipment.filter((item) => members.has(item.neighborhoodId)),
      occurrences.filter((item) => members.has(item.neighborhoodId)),
      countAgents(members),
      REGION_LIMITS,
    );
    const criticalNeighborhoods = neighborhoods.filter(
      (item) => members.has(item.id) && item.level === "critical",
    ).length;
    if (criticalNeighborhoods > 0 && health.level === "normal") {
      health.level = "attention";
    }
    if (criticalNeighborhoods > 0) {
      health.reasons.push(
        `${criticalNeighborhoods} ${plural(criticalNeighborhoods, "bairro", "bairros")} em situação crítica`,
      );
    }
    return health;
  });

  return { neighborhoods, regions };
}

export function computeAlerts(
  input: OperationsInput,
  areas: { neighborhoods: AreaHealth[] },
): Alert[] {
  const { equipment, agents, occurrences, anomalies, staffing, acknowledged, now, city } = input;
  const alerts: Alert[] = [];
  const add = (alert: Omit<Alert, "acknowledged">) =>
    alerts.push({ ...alert, acknowledged: acknowledged.has(alert.id) });

  for (const item of equipment) {
    const target = { kind: "equipment" as const, id: String(item.id) };
    const where = `${item.street}, ${item.reference}`;
    const position = { lat: item.currentLat ?? item.lat, lng: item.currentLng ?? item.lng };
    if (item.status === "malfunction") {
      add({
        id: `equipment-malfunction-${item.id}`,
        level: SAFETY_CRITICAL.has(item.type) ? "critical" : "warning",
        category: "equipment",
        title: `${EQUIPMENT_TYPES[item.type].label} com mau funcionamento`,
        detail: `${item.serialNumber} em ${where}`,
        target,
        ...position,
        since: item.updatedAt,
      });
    } else if (item.status === "stolen") {
      add({
        id: `equipment-stolen-${item.id}`,
        level: "critical",
        category: "equipment",
        title: `Furto registrado: ${EQUIPMENT_TYPES[item.type].label.toLowerCase()}`,
        detail: `${item.serialNumber}, último local conhecido: ${where}`,
        target,
        ...position,
        since: item.updatedAt,
      });
    } else if (item.maintenanceNeed === "immediate") {
      add({
        id: `maintenance-immediate-${item.id}`,
        level: "warning",
        category: "maintenance",
        title: "Manutenção imediata solicitada",
        detail: `${equipmentLabel(item)} em ${where}`,
        target,
        ...position,
        since: item.updatedAt,
      });
    }

    const daysLeft = maintenanceDaysLeft(item, now);
    if (daysLeft !== null && item.status === "operational") {
      if (daysLeft < 0) {
        add({
          id: `maintenance-overdue-${item.id}`,
          level: "warning",
          category: "maintenance",
          title: `Manutenção vencida há ${-daysLeft} ${plural(-daysLeft, "dia", "dias")}`,
          detail: `${equipmentLabel(item)} em ${where}`,
          target,
          ...position,
          since: new Date(now).toISOString(),
        });
      } else if (daysLeft <= MAINTENANCE_SOON_DAYS) {
        add({
          id: `maintenance-soon-${item.id}`,
          level: "info",
          category: "maintenance",
          title:
            daysLeft === 0
              ? "Manutenção prevista para hoje"
              : `Manutenção prevista em ${daysLeft} ${plural(daysLeft, "dia", "dias")}`,
          detail: `${equipmentLabel(item)} em ${where}`,
          target,
          ...position,
          since: new Date(now).toISOString(),
        });
      }
    }

    if (item.status === "operational" && item.installedAt !== null) {
      const silentMinutes = minutesSince(item.lastSeenAt, now);
      if (silentMinutes >= HEARTBEAT_WARNING_MINUTES) {
        add({
          id: `telemetry-silent-${item.id}`,
          level: silentMinutes >= HEARTBEAT_CRITICAL_MINUTES ? "warning" : "info",
          category: "telemetry",
          title: Number.isFinite(silentMinutes)
            ? `Sem comunicação há ${Math.floor(silentMinutes)} min`
            : "Sem comunicação registrada",
          detail: `${equipmentLabel(item)} consta como operacional, mas parou de enviar telemetria`,
          target,
          ...position,
          since: item.lastSeenAt ?? item.updatedAt,
        });
      }
    }
  }

  for (const occurrence of occurrences) {
    if (occurrence.status === "resolved" || occurrence.severity < 3) {
      continue;
    }
    const unassigned = occurrence.agentId === null;
    const level: AlertLevel = unassigned
      ? "critical"
      : occurrence.severity === 4
        ? "warning"
        : "info";
    const neighborhood = city.neighborhoods.find((item) => item.id === occurrence.neighborhoodId);
    add({
      id: `occurrence-${occurrence.id}`,
      level,
      category: "occurrence",
      title: `${OCCURRENCE_KINDS[occurrence.kind].label} (${SEVERITY_LABELS[occurrence.severity].toLowerCase()})`,
      detail: `${occurrence.description} em ${neighborhood?.name ?? occurrence.neighborhoodId}. ${
        unassigned ? "Sem equipe designada." : "Equipe a caminho ou no local."
      }`,
      target: { kind: "occurrence", id: String(occurrence.id) },
      lat: occurrence.lat,
      lng: occurrence.lng,
      since: occurrence.createdAt,
    });
  }

  for (const area of areas.neighborhoods) {
    if (area.level !== "critical") {
      continue;
    }
    const neighborhood = city.neighborhoods.find((item) => item.id === area.id);
    add({
      id: `region-critical-${area.id}`,
      level: "warning",
      category: "region",
      title: `${area.name} exige atenção`,
      detail: area.reasons.join("; "),
      target: { kind: "neighborhood", id: area.id },
      lat: neighborhood?.lat ?? null,
      lng: neighborhood?.lng ?? null,
      since: new Date(now).toISOString(),
    });
  }

  for (const anomaly of anomalies) {
    const item =
      anomaly.equipmentId === null ? null : equipment.find((e) => e.id === anomaly.equipmentId);
    const neighborhood = city.neighborhoods.find((n) => n.id === anomaly.neighborhoodId);
    add({
      id: `anomaly-${anomaly.id}`,
      level: anomaly.kind === "occurrence_spike" ? "critical" : "warning",
      category: "anomaly",
      title: anomaly.title,
      detail: anomaly.detail,
      target: item
        ? { kind: "equipment", id: String(item.id) }
        : neighborhood
          ? { kind: "neighborhood", id: neighborhood.id }
          : null,
      lat: item?.lat ?? neighborhood?.lat ?? null,
      lng: item?.lng ?? neighborhood?.lng ?? null,
      since: anomaly.detectedAt,
    });
  }

  for (const region of staffing?.regions ?? []) {
    if (region.gap < 2) {
      continue;
    }
    add({
      id: `staffing-${region.regionId}`,
      level: "warning",
      category: "staffing",
      title: `Reforço recomendado: ${region.regionName}`,
      detail: region.action,
      target: null,
      lat: null,
      lng: null,
      since: staffing?.generatedAt ?? new Date(now).toISOString(),
    });
  }

  const responding = agents.filter((agent) => agent.status === "responding").length;
  const available = agents.filter((agent) => agent.status === "available").length;
  if (agents.some((agent) => agent.status !== "off_duty") && available === 0 && responding > 0) {
    add({
      id: "staffing-exhausted",
      level: "critical",
      category: "staffing",
      title: "Nenhum agente disponível",
      detail: `Todos os ${responding} agentes em serviço estão em atendimento.`,
      target: null,
      lat: null,
      lng: null,
      since: new Date(now).toISOString(),
    });
  }

  for (const alert of alerts) {
    if (alert.level === "critical" && now - Date.parse(alert.since) > STALE_CRITICAL_MS) {
      alert.level = "warning";
    }
  }

  const rank: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort(
    (a, b) =>
      Number(a.acknowledged) - Number(b.acknowledged) ||
      rank[a.level] - rank[b.level] ||
      Date.parse(b.since) - Date.parse(a.since),
  );
}

const LIST_FORMAT = new Intl.ListFormat("pt-BR", { type: "conjunction" });

function waitingPhrase(count: number, critical: boolean): string {
  const noun = count === 1 ? "ocorrência" : "ocorrências";
  const adjective = critical ? (count === 1 ? " crítica" : " críticas") : "";
  return `${count} ${noun}${adjective} esperando equipe`;
}

export function computeCityHealth(regions: AreaHealth[], occurrences: Occurrence[]): CityHealth {
  const waiting = occurrences.filter((item) => item.status === "open");
  const waitingCritical = waiting.filter((item) => item.severity === 4).length;
  const names = (level: HealthLevel) =>
    regions.filter((region) => region.level === level).map((region) => region.name);

  const critical = names("critical");
  if (critical.length > 0 || waitingCritical > 0) {
    const reasons: string[] = [];
    if (critical.length > 0) {
      reasons.push(`${LIST_FORMAT.format(critical)} em situação crítica`);
    }
    if (waitingCritical > 0) {
      reasons.push(waitingPhrase(waitingCritical, true));
    }
    return { level: "critical", reasons };
  }

  const attention = names("attention");
  if (attention.length > 0 || waiting.length > 0) {
    const reasons: string[] = [];
    if (attention.length > 0) {
      reasons.push(
        `${LIST_FORMAT.format(attention)} ${attention.length === 1 ? "pede" : "pedem"} atenção`,
      );
    }
    if (waiting.length > 0) {
      reasons.push(waitingPhrase(waiting.length, false));
    }
    return { level: "attention", reasons };
  }

  return { level: "normal", reasons: [] };
}

export function computeSummary(input: OperationsInput): OperationsSummary {
  const areas = computeAreaHealth(input);
  const alerts = computeAlerts(input, areas);
  return {
    generatedAt: new Date(input.now).toISOString(),
    city: computeCityHealth(areas.regions, input.occurrences),
    kpis: computeKpis(input, alerts),
    regions: areas.regions,
    neighborhoods: areas.neighborhoods,
    alerts,
  };
}
