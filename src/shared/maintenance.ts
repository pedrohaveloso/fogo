import { countsTowardAvailability } from "./catalog.ts";
import { daysBetween, localDate } from "./time.ts";
import type { Equipment } from "./types.ts";

export const MAINTENANCE_SOON_DAYS = 7;

export type MaintenanceState = "urgent" | "soon";

function tracked(item: Equipment): boolean {
  return countsTowardAvailability(item.status) && item.status !== "stolen";
}

export function maintenanceDaysLeft(item: Equipment, now: number): number | null {
  if (item.nextMaintenanceAt === null || !tracked(item)) {
    return null;
  }
  return daysBetween(localDate(now), item.nextMaintenanceAt);
}

export function maintenanceState(item: Equipment, now: number): MaintenanceState | null {
  if (!tracked(item)) {
    return null;
  }
  if (item.maintenanceNeed === "immediate") {
    return "urgent";
  }
  const daysLeft = maintenanceDaysLeft(item, now);
  if (daysLeft === null || daysLeft > MAINTENANCE_SOON_DAYS) {
    return null;
  }
  return daysLeft < 0 ? "urgent" : "soon";
}
