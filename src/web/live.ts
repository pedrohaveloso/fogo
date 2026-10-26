import { useSyncExternalStore } from "react";
import type { Meta, OperationsSnapshot, StreamTick } from "../shared/types.ts";
import { api } from "./api.ts";
import { cityPath, currentCityId } from "./cityScope.ts";

export type LiveState = {
  snapshot: OperationsSnapshot | null;
  connected: boolean;
  receivedAt: number;
};

export function applyTick(snapshot: OperationsSnapshot, tick: StreamTick): OperationsSnapshot {
  const removedEquipment = new Set(tick.removedEquipment);
  const removedAgents = new Set(tick.removedAgents);
  const positions = new Map(tick.agents.map((item) => [item.id, item]));
  const agentRecords = new Map(tick.agentRecords.map((item) => [item.id, item]));
  const moving = new Map(tick.movingEquipment.map((item) => [item.id, item]));
  const changedEquipment = new Map(tick.equipment.map((item) => [item.id, item]));

  const agents = snapshot.agents
    .filter((agent) => !removedAgents.has(agent.id))
    .map((agent) => {
      const record = agentRecords.get(agent.id);
      if (record) {
        agentRecords.delete(agent.id);
        return record;
      }
      const position = positions.get(agent.id);
      return position ? Object.assign({}, agent, position) : agent;
    });
  agents.push(...agentRecords.values());

  const equipment = snapshot.equipment
    .filter((item) => !removedEquipment.has(item.id))
    .map((item) => {
      const changed = changedEquipment.get(item.id);
      if (changed) {
        changedEquipment.delete(item.id);
        return changed;
      }
      const position = moving.get(item.id);
      return position
        ? Object.assign({}, item, {
            currentLat: position.lat,
            currentLng: position.lng,
            battery: position.battery,
          })
        : item;
    });
  equipment.push(...changedEquipment.values());

  const occurrences = new Map(snapshot.occurrences.map((item) => [item.id, item]));
  for (const occurrence of tick.occurrences) {
    if (occurrence.status === "resolved") {
      occurrences.delete(occurrence.id);
    } else {
      occurrences.set(occurrence.id, occurrence);
    }
  }

  return {
    ...tick.summary,
    equipment,
    agents,
    occurrences: [...occurrences.values()].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
  };
}

export const STALE_AFTER_MS = 10_000;

export function liveStatus(
  live: Pick<LiveState, "connected" | "receivedAt">,
  now: number,
): { stale: boolean; text: string } {
  if (live.receivedAt === 0) {
    return { stale: true, text: "Conectando" };
  }
  const age = Math.max(0, now - live.receivedAt);
  if (live.connected && age < STALE_AFTER_MS) {
    return { stale: false, text: "Ao vivo" };
  }
  const seconds = Math.round(age / 1000);
  const elapsed = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`;
  return { stale: true, text: `Sem dados há ${elapsed}` };
}

let state: LiveState = { snapshot: null, connected: false, receivedAt: 0 };
const listeners = new Set<() => void>();
let source: EventSource | null = null;

function emit(next: Partial<LiveState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) {
    listener();
  }
}

function connect(): void {
  if (source || currentCityId() === null) {
    return;
  }
  source = new EventSource(`/api${cityPath("/operations/stream")}`);
  source.addEventListener("open", () => emit({ connected: true }));
  source.addEventListener("error", () => emit({ connected: false }));
  source.addEventListener("snapshot", (event) => {
    emit({
      snapshot: JSON.parse((event as MessageEvent<string>).data) as OperationsSnapshot,
      connected: true,
      receivedAt: Date.now(),
    });
  });
  source.addEventListener("tick", (event) => {
    if (!state.snapshot) {
      return;
    }
    const tick = JSON.parse((event as MessageEvent<string>).data) as StreamTick;
    if (tick.metaChanged) {
      reloadMeta();
    }
    emit({ snapshot: applyTick(state.snapshot, tick), connected: true, receivedAt: Date.now() });
  });
}

function disconnect(): void {
  source?.close();
  source = null;
  emit({ connected: false });
}

export function shouldStream(hidden: boolean, listenerCount: number): boolean {
  return !hidden && listenerCount > 0;
}

function syncConnection(): void {
  if (shouldStream(document.hidden, listeners.size)) {
    connect();
  } else if (source) {
    disconnect();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", syncConnection);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  syncConnection();
  return () => {
    listeners.delete(listener);
    syncConnection();
  };
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state);
}

let meta: Meta | null = null;
let metaPromise: Promise<void> | null = null;
const metaListeners = new Set<() => void>();

function loadMeta(): Promise<void> {
  const cityId = currentCityId();
  if (cityId === null) {
    return Promise.resolve();
  }
  return api.get<Meta>(cityPath("/meta", cityId)).then((value) => {
    if (cityId !== currentCityId()) {
      return;
    }
    meta = value;
    for (const item of metaListeners) {
      item();
    }
  });
}

function subscribeMeta(listener: () => void): () => void {
  metaListeners.add(listener);
  metaPromise ??= loadMeta().catch(() => {
    metaPromise = null;
  });
  return () => metaListeners.delete(listener);
}

export function reloadMeta(): void {
  loadMeta().catch(() => {});
}

export function retryConnection(): void {
  disconnect();
  syncConnection();
  if (!meta) {
    metaPromise = null;
    for (const listener of metaListeners) {
      subscribeMeta(listener);
    }
  }
}

export function resetCity(): void {
  disconnect();
  state = { snapshot: null, connected: false, receivedAt: 0 };
  meta = null;
  metaPromise = null;
  for (const listener of [...listeners, ...metaListeners]) {
    listener();
  }
  syncConnection();
  if (metaListeners.size > 0) {
    metaPromise = loadMeta().catch(() => {
      metaPromise = null;
    });
  }
}

export function useMeta(): Meta | null {
  return useSyncExternalStore(subscribeMeta, () => meta);
}
