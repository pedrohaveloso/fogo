import { plural } from "../../shared/text.ts";
import {
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import { DAY, HOUR, daysBetween, localDate, startOfLocalDay } from "../../shared/time.ts";
import type { Equipment, FailureRisk, FailureRiskReport } from "../../shared/types.ts";
import { clamp } from "./stats.ts";

export type StatusEventRecord = { equipmentId: number; status: EquipmentStatus; at: number };
export type MaintenanceRecord = { equipmentId: number; at: number };

const HORIZON_DAYS = 7;
const RECENT_DAYS = 30;
const REPEAT_DAYS = 90;
const TOP_ITEMS = 25;

type Exposure = {
  onTime: number;
  overdue: number;
  unknown: number;
  failures: number;
  failuresOverdue: number;
  failuresOnTime: number;
  recentExposure: number;
  recentFailures: number;
};

function emptyExposure(): Exposure {
  return {
    onTime: 0,
    overdue: 0,
    unknown: 0,
    failures: 0,
    failuresOverdue: 0,
    failuresOnTime: 0,
    recentExposure: 0,
    recentFailures: 0,
  };
}

function groupBy<T extends { equipmentId: number; at: number }>(
  items: readonly T[],
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const list = groups.get(item.equipmentId) ?? [];
    list.push(item);
    groups.set(item.equipmentId, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.at - b.at);
  }
  return groups;
}

export function assessFailureRisk(
  equipment: readonly Equipment[],
  statusEvents: readonly StatusEventRecord[],
  maintenanceEvents: readonly MaintenanceRecord[],
  now: number,
  windowDays: number,
): FailureRiskReport {
  const windowStart = startOfLocalDay(now - windowDays * DAY);
  const recentStart = now - RECENT_DAYS * DAY;
  const eventsById = groupBy(statusEvents);
  const maintenanceById = groupBy(maintenanceEvents);
  const exposure = new Map<EquipmentType, Exposure>(
    EQUIPMENT_TYPE_KEYS.map((type) => [type, emptyExposure()]),
  );

  for (const item of equipment) {
    const events = eventsById.get(item.id) ?? [];
    const maintenance = maintenanceById.get(item.id) ?? [];
    const stats = exposure.get(item.type)!;
    const interval =
      item.maintenanceIntervalDays ?? EQUIPMENT_TYPES[item.type].maintenanceIntervalDays;
    let eventIndex = 0;
    let maintenanceIndex = 0;
    let status: EquipmentStatus | null = null;
    let lastMaintenance: number | null = null;

    for (let day = windowStart; day < now; day += DAY) {
      const noon = day + 12 * HOUR;
      const dayEnd = day + DAY;
      while (eventIndex < events.length && events[eventIndex]!.at <= noon) {
        status = events[eventIndex]!.status;
        eventIndex += 1;
      }
      while (maintenanceIndex < maintenance.length && maintenance[maintenanceIndex]!.at <= day) {
        lastMaintenance = maintenance[maintenanceIndex]!.at;
        maintenanceIndex += 1;
      }
      if (status !== "operational") {
        continue;
      }
      const failed = events.some(
        (event) => event.status === "malfunction" && event.at >= day && event.at < dayEnd,
      );
      const overdue = lastMaintenance === null ? null : (day - lastMaintenance) / DAY > interval;
      if (overdue === null) {
        stats.unknown += 1;
      } else if (overdue) {
        stats.overdue += 1;
      } else {
        stats.onTime += 1;
      }
      if (day >= recentStart) {
        stats.recentExposure += 1;
      }
      if (failed) {
        stats.failures += 1;
        if (overdue === true) {
          stats.failuresOverdue += 1;
        } else if (overdue === false) {
          stats.failuresOnTime += 1;
        }
        if (day >= recentStart) {
          stats.recentFailures += 1;
        }
      }
    }
  }

  const totals = [...exposure.values()].reduce(
    (sum, item) => ({
      overdue: sum.overdue + item.overdue,
      onTime: sum.onTime + item.onTime,
      failuresOverdue: sum.failuresOverdue + item.failuresOverdue,
      failuresOnTime: sum.failuresOnTime + item.failuresOnTime,
    }),
    { overdue: 0, onTime: 0, failuresOverdue: 0, failuresOnTime: 0 },
  );
  const overdueHazardRatio = clamp(
    (totals.failuresOverdue + 0.5) /
      (totals.overdue + 1) /
      ((totals.failuresOnTime + 0.5) / (totals.onTime + 1)),
    0.5,
    10,
  );

  const baselineDailyRate: Record<string, number> = {};
  const typeTrend = new Map<EquipmentType, number>();
  for (const [type, stats] of exposure) {
    const totalExposure = stats.onTime + stats.unknown + stats.overdue;
    baselineDailyRate[type] =
      (stats.failures + 0.5) /
      (stats.onTime + stats.unknown + overdueHazardRatio * stats.overdue + 30);
    const overall = (stats.failures + 0.5) / (totalExposure + 30);
    const recent = (stats.recentFailures + 0.5) / (stats.recentExposure + 10);
    typeTrend.set(type, clamp(recent / overall, 0.5, 3));
  }

  const today = localDate(now);
  const items: FailureRisk[] = equipment
    .filter((item) => item.status === "operational")
    .map((item) => {
      const daysLeft =
        item.nextMaintenanceAt === null ? null : daysBetween(today, item.nextMaintenanceAt);
      const base = baselineDailyRate[item.type] ?? 0;
      const trend = typeTrend.get(item.type) ?? 1;
      let hazard = 0;
      for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
        const overdue = daysLeft !== null && daysLeft - offset < 0;
        hazard += base * trend * (overdue ? overdueHazardRatio : 1);
      }
      const probability7d = 1 - Math.exp(-hazard);
      const recentFailures = (eventsById.get(item.id) ?? []).filter(
        (event) => event.status === "malfunction" && event.at >= now - REPEAT_DAYS * DAY,
      ).length;
      const daysOverdue = daysLeft !== null && daysLeft < 0 ? -daysLeft : 0;
      const factors: string[] = [];
      if (daysOverdue > 0) {
        factors.push(
          `Manutenção vencida há ${daysOverdue} ${plural(daysOverdue, "dia", "dias")}; no histórico, isso multiplica o risco de falha por ${overdueHazardRatio.toFixed(1).replace(".", ",")}`,
        );
      } else if (daysLeft !== null && daysLeft < HORIZON_DAYS) {
        factors.push(
          daysLeft === 0
            ? "Manutenção vence hoje"
            : `Manutenção vence em ${daysLeft} ${plural(daysLeft, "dia", "dias")}`,
        );
      }
      if (trend >= 1.3) {
        factors.push(
          `Falhas de ${EQUIPMENT_TYPES[item.type].plural.toLowerCase()} ${Math.round((trend - 1) * 100)}% acima da média nos últimos ${RECENT_DAYS} dias`,
        );
      }
      if (recentFailures > 0) {
        factors.push(
          `${recentFailures} ${plural(recentFailures, "falha", "falhas")} nos últimos ${REPEAT_DAYS} dias`,
        );
      }
      factors.push(
        `Taxa histórica do tipo: 1 falha a cada ${Math.round(1 / Math.max(base, 1e-6))} dias de operação`,
      );

      let recommendation = "Manter o monitoramento de rotina.";
      if (daysOverdue > 0) {
        recommendation = "Executar a manutenção preventiva atrasada.";
      } else if (daysLeft !== null && daysLeft < HORIZON_DAYS) {
        recommendation = `Antecipar a manutenção preventiva prevista para ${item.nextMaintenanceAt?.split("-").toReversed().join("/")}.`;
      } else if (trend >= 1.3) {
        recommendation = "Inspecionar a unidade e avaliar a renovação da frota deste tipo.";
      }

      return {
        equipmentId: item.id,
        serialNumber: item.serialNumber,
        type: item.type,
        neighborhoodId: item.neighborhoodId,
        probability7d,
        daysOverdue,
        recentFailures,
        factors,
        recommendation,
      };
    })
    .sort((a, b) => b.probability7d - a.probability7d)
    .slice(0, TOP_ITEMS);

  return {
    generatedAt: new Date(now).toISOString(),
    baselineDailyRate,
    overdueHazardRatio,
    items,
  };
}
