export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const LOCAL_OFFSET = -3 * HOUR;

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function localParts(ms: number): { dow: number; hour: number; minute: number } {
  const shifted = new Date(ms + LOCAL_OFFSET);
  return { dow: shifted.getUTCDay(), hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

export function hourOfWeek(ms: number): number {
  const { dow, hour } = localParts(ms);
  return dow * 24 + hour;
}

export function startOfHour(ms: number): number {
  return Math.floor(ms / HOUR) * HOUR;
}

export function startOfLocalDay(ms: number): number {
  return Math.floor((ms + LOCAL_OFFSET) / DAY) * DAY - LOCAL_OFFSET;
}

export function localDate(ms: number): string {
  return new Date(ms + LOCAL_OFFSET).toISOString().slice(0, 10);
}

export function parseLocalDate(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) - LOCAL_OFFSET;
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((parseLocalDate(toDate) - parseLocalDate(fromDate)) / DAY);
}

export function addDays(date: string, days: number): string {
  return localDate(parseLocalDate(date) + days * DAY + 12 * HOUR);
}
