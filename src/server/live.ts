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

  async function acknowledged(): Promise<Set<string>> {
    const rows = await db.query<{ alert_id: string }>("SELECT alert_id FROM alert_acks");
    return new Set(rows.map((row) => row.alert_id));
  }

  async function state(now: number) {
    const [equipment, agents, occurrences, anomalies, staffing, acks] = await Promise.all([
      listEquipment(db, city.city.id),
      listAgents(db, city.city.id),
      listActiveOccurrences(db, city.city.id),
      predictions.anomalies(now),
      predictions.staffing(now, STAFFING_HORIZON_HOURS),
      acknowledged(),
    ]);
    const operations = computeSummary({
      city,
      equipment,
      agents,
      occurrences,
      anomalies,
      staffing,
      acknowledged: acks,
      now,
    });
    cityLevel = levelSince(cityLevel, operations.city.level, now);
    operations.city.since = cityLevel.since;
    return { equipment, agents, occurrences, operations };
  }

  async function summary(now: number): Promise<OperationsSummary> {
    return (await state(now)).operations;
  }

  async function snapshot(now: number): Promise<OperationsSnapshot> {
    const { equipment, agents, occurrences, operations } = await state(now);
    return { ...operations, equipment, agents, occurrences };
  }

  async function publish(change: Partial<Omit<StreamTick, "summary">>, now: number): Promise<void> {
    if (listeners.size === 0) {
      return;
    }
    const tick: StreamTick = {
      summary: await summary(now),
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

  async function acknowledge(alertId: string, now: number): Promise<void> {
    await db.run(
      "INSERT INTO alert_acks (alert_id, acknowledged_at) VALUES ($1, $2) ON CONFLICT (alert_id) DO NOTHING",
      [alertId, now],
    );
  }

  async function unacknowledge(alertId: string): Promise<void> {
    await db.run("DELETE FROM alert_acks WHERE alert_id = $1", [alertId]);
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
