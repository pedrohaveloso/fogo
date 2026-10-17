import { EQUIPMENT_TYPES, type EquipmentType } from "../../shared/catalog.ts";
import type { Anomaly, Equipment } from "../../shared/types.ts";
import { mean, poissonTail, standardDeviation } from "./stats.ts";

export const FLOW_Z_THRESHOLD = 3.5;
export const MIN_BASELINE_POINTS = 3;
export const MIN_BASELINE_MEAN = 30;
export const SILENT_MIN_EXPECTED = 20;
export const MIN_PARTIAL_FRACTION = 0.3;
export const SPIKE_P_VALUE = 0.005;
export const SPIKE_MIN_COUNT = 3;

export type FlowWindow = { observed: number; baseline: number[]; fraction: number };

export type FlowInput = {
  equipment: Equipment;
  lastHour: FlowWindow | null;
  currentHour: FlowWindow | null;
};

function unitFor(type: EquipmentType): string {
  if (type === "parking_kiosk") {
    return "transações";
  }
  if (type === "automated_gate") {
    return "passagens";
  }
  return type === "truck_scale" ? "caminhões" : "veículos";
}

type Evaluation = { kind: Anomaly["kind"]; z: number; observed: number; expected: number };

export function evaluateFlowWindow(window: FlowWindow): Evaluation | null {
  if (window.baseline.length < MIN_BASELINE_POINTS) {
    return null;
  }
  const average = mean(window.baseline);
  if (average < MIN_BASELINE_MEAN) {
    return null;
  }
  const expected = average * window.fraction;
  const spread = Math.max(
    standardDeviation(window.baseline) * window.fraction,
    Math.sqrt(expected),
    1,
  );
  const z = (window.observed - expected) / spread;
  if (window.observed === 0 && average >= SILENT_MIN_EXPECTED) {
    return { kind: "silent_device", z, observed: 0, expected };
  }
  if (z <= -FLOW_Z_THRESHOLD && window.observed < expected * 0.5) {
    return { kind: "flow_drop", z, observed: window.observed, expected };
  }
  if (z >= FLOW_Z_THRESHOLD && window.observed > expected * 1.6) {
    return { kind: "flow_spike", z, observed: window.observed, expected };
  }
  return null;
}

export function detectFlowAnomalies(inputs: readonly FlowInput[], now: number): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const input of inputs) {
    const current =
      input.currentHour && input.currentHour.fraction >= MIN_PARTIAL_FRACTION
        ? evaluateFlowWindow(input.currentHour)
        : null;
    const evaluation = current ?? (input.lastHour ? evaluateFlowWindow(input.lastHour) : null);
    if (!evaluation) {
      continue;
    }
    const { equipment } = input;
    const label = EQUIPMENT_TYPES[equipment.type].label;
    const unit = unitFor(equipment.type);
    const observed = Math.round(evaluation.observed);
    const expected = Math.round(evaluation.expected);
    const period = current ? "nesta hora até agora" : "na última hora";
    const texts: Record<Anomaly["kind"], { title: string; detail: string }> = {
      silent_device: {
        title: `${label} ${equipment.serialNumber} com leitura zerada`,
        detail: `Nenhum registro ${period}, contra cerca de ${expected} ${unit} esperados. O equipamento continua enviando sinal, então pode haver lente obstruída, sensor travado ou falha de software.`,
      },
      flow_drop: {
        title: `Queda de fluxo em ${equipment.street}`,
        detail: `${observed} ${unit} ${period}, contra cerca de ${expected} esperados para o horário. Pode indicar bloqueio na via ou falha parcial do sensor.`,
      },
      flow_spike: {
        title: `Fluxo acima do normal em ${equipment.street}`,
        detail: `${observed} ${unit} ${period}, contra cerca de ${expected} esperados. Possível desvio de trânsito, evento ou acidente nas proximidades.`,
      },
      occurrence_spike: { title: "", detail: "" },
    };
    anomalies.push({
      id: `${evaluation.kind}-${equipment.id}`,
      kind: evaluation.kind,
      ...texts[evaluation.kind],
      score: Math.abs(evaluation.z),
      observed,
      expected,
      equipmentId: equipment.id,
      neighborhoodId: equipment.neighborhoodId,
      detectedAt: new Date(now).toISOString(),
    });
  }
  return anomalies;
}

export type SpikeInput = {
  neighborhoodId: string;
  name: string;
  observed: number;
  expected: number;
};

export function detectOccurrenceSpikes(inputs: readonly SpikeInput[], now: number): Anomaly[] {
  return inputs.flatMap((input) => {
    if (input.observed < SPIKE_MIN_COUNT) {
      return [];
    }
    const p = poissonTail(input.observed, input.expected);
    if (p >= SPIKE_P_VALUE) {
      return [];
    }
    const chance = p < 0.0001 ? "menos de 0,01%" : `${(p * 100).toFixed(2).replace(".", ",")}%`;
    return [
      {
        id: `occurrence_spike-${input.neighborhoodId}`,
        kind: "occurrence_spike" as const,
        title: `Concentração incomum de ocorrências em ${input.name}`,
        detail: `${input.observed} ocorrências na última hora, contra ${input.expected.toFixed(1).replace(".", ",")} esperadas. A chance de isso acontecer por acaso é de ${chance}.`,
        score: -Math.log10(Math.max(p, 1e-12)),
        observed: input.observed,
        expected: input.expected,
        equipmentId: null,
        neighborhoodId: input.neighborhoodId,
        detectedAt: new Date(now).toISOString(),
      },
    ];
  });
}
