import type { Equipment } from "./types.ts";

export const SILENT_AFTER_MINUTES = 3;
export const SILENT_LONG_MINUTES = 15;

const MINUTE = 60_000;

export function silentMinutes(item: Equipment, now: number): number | null {
  if (item.status !== "operational" || item.installedAt === null) {
    return null;
  }
  const minutes =
    item.lastSeenAt === null
      ? Number.POSITIVE_INFINITY
      : (now - Date.parse(item.lastSeenAt)) / MINUTE;
  return minutes >= SILENT_AFTER_MINUTES ? minutes : null;
}
