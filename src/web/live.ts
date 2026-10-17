import { useSyncExternalStore } from "react";
import type { Meta, OperationsSnapshot, StreamTick } from "../shared/types.ts";
import { api } from "./api.ts";

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
  if (source) {
    return;
  }
  source = new EventSource("/api/operations/stream");
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
    emit({ snapshot: applyTick(state.snapshot, tick), connected: true, receivedAt: Date.now() });
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  connect();
  return () => listeners.delete(listener);
}

export function useLive(): LiveState {
  return useSyncExternalStore(subscribe, () => state);
}

let meta: Meta | null = null;
let metaPromise: Promise<void> | null = null;
const metaListeners = new Set<() => void>();

function subscribeMeta(listener: () => void): () => void {
  metaListeners.add(listener);
  metaPromise ??= api
    .get<Meta>("/meta")
    .then((value) => {
      meta = value;
      for (const item of metaListeners) {
        item();
      }
    })
    .catch(() => {
      metaPromise = null;
    });
  return () => metaListeners.delete(listener);
}

export function useMeta(): Meta | null {
  return useSyncExternalStore(subscribeMeta, () => meta);
}
