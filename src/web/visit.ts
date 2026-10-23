const STORAGE_KEY = "fogo:visit";
export const VISIT_GAP_MS = 15 * 60_000;
const HEARTBEAT_MS = 30_000;

export type StoredVisit = { baseline: number | null; lastSeen: number };

export function resolveBaseline(stored: StoredVisit | null, now: number): number | null {
  if (!stored) {
    return null;
  }
  return now - stored.lastSeen > VISIT_GAP_MS ? stored.lastSeen : stored.baseline;
}

function read(): StoredVisit | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "lastSeen" in parsed &&
      typeof parsed.lastSeen === "number" &&
      "baseline" in parsed &&
      (parsed.baseline === null || typeof parsed.baseline === "number")
    ) {
      return { baseline: parsed.baseline, lastSeen: parsed.lastSeen };
    }
  } catch {
    return null;
  }
  return null;
}

function write(visit: StoredVisit): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    return;
  }
}

function track(): number | null {
  const now = Date.now();
  const baseline = resolveBaseline(read(), now);
  write({ baseline, lastSeen: now });
  const touch = () => write({ baseline, lastSeen: Date.now() });
  setInterval(() => {
    if (!document.hidden) {
      touch();
    }
  }, HEARTBEAT_MS);
  window.addEventListener("pagehide", touch);
  return baseline;
}

let baseline: number | null | undefined;

export function visitBaseline(): number | null {
  baseline ??= track();
  return baseline;
}
