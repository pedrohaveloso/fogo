import type {
  CityDataset,
  HealthLevel,
  OperationsSnapshot,
  OperationsSummary,
  StreamTick,
} from "../shared/types.ts";
import type { Database } from "./db.ts";
import { computeSummary, levelSince } from "./operations.ts";
import type { PredictionService } from "./predictions/service.ts";
import { listAgents } from "./repositories/agents.ts";
import { listEquipment } from "./repositories/equipment.ts";
import { listActiveOccurrences } from "./repositories/occurrences.ts";

export type LiveMessage =
  | { type: "snapshot"; data: OperationsSnapshot }
  | { type: "tick"; data: StreamTick };

type Listener = (message: LiveMessage) => void;

export type LiveHub = ReturnType<typeof createLiveHub>;

const STAFFING_HORIZON_HOURS = 4;

export function createLiveHub(db: Database, city: CityDataset, predictions: PredictionService) {
  const listeners = new Set<Listener>();
  let cityLevel: { level: HealthLevel; since: string } | null = null;

  function acknowledged(): Set<string> {
    const rows = db.prepare("SELECT alert_id FROM alert_acks").all() as { alert_id: string }[];
    return new Set(rows.map((row) => row.alert_id));
  }

  function state(now: number) {
    const equipment = listEquipment(db);
    const agents = listAgents(db);
    const occurrences = listActiveOccurrences(db);
    const operations = computeSummary({
      city,
      equipment,
      agents,
      occurrences,
      anomalies: predictions.anomalies(now),
      staffing: predictions.staffing(now, STAFFING_HORIZON_HOURS),
      acknowledged: acknowledged(),
      now,
    });
    cityLevel = levelSince(cityLevel, operations.city.level, now);
    operations.city.since = cityLevel.since;
    return { equipment, agents, occurrences, operations };
  }

  function summary(now: number): OperationsSummary {
    return state(now).operations;
  }

  function snapshot(now: number): OperationsSnapshot {
    const { equipment, agents, occurrences, operations } = state(now);
    return { ...operations, equipment, agents, occurrences };
  }

  function publish(change: Partial<Omit<StreamTick, "summary">>, now: number): void {
    if (listeners.size === 0) {
      return;
    }
    const tick: StreamTick = {
      summary: summary(now),
      agents: change.agents ?? [],
      agentRecords: change.agentRecords ?? [],
      movingEquipment: change.movingEquipment ?? [],
      equipment: change.equipment ?? [],
      occurrences: change.occurrences ?? [],
      removedEquipment: change.removedEquipment ?? [],
      removedAgents: change.removedAgents ?? [],
      metaChanged: change.metaChanged ?? false,
    };
    for (const listener of listeners) {
      listener({ type: "tick", data: tick });
    }
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function acknowledge(alertId: string, now: number): void {
    db.prepare(
      "INSERT INTO alert_acks (alert_id, acknowledged_at) VALUES (?, ?) ON CONFLICT (alert_id) DO NOTHING",
    ).run(alertId, now);
  }

  function unacknowledge(alertId: string): void {
    db.prepare("DELETE FROM alert_acks WHERE alert_id = ?").run(alertId);
  }

  return {
    summary,
    snapshot,
    publish,
    subscribe,
    acknowledge,
    unacknowledge,
    listenerCount: () => listeners.size,
  };
}
