import { describe, expect, it } from "vitest";
import { NOW, makeEquipment } from "../test-fixtures.ts";
import { detectFlowAnomalies, detectOccurrenceSpikes, evaluateFlowWindow } from "./anomalies.ts";

const baseline = [500, 520, 480, 510];

describe("evaluateFlowWindow", () => {
  it("accepts normal readings", () => {
    expect(evaluateFlowWindow({ observed: 505, baseline, fraction: 1 })).toBeNull();
  });

  it("flags a device that reports zero while traffic is expected", () => {
    expect(evaluateFlowWindow({ observed: 0, baseline, fraction: 1 })?.kind).toBe("silent_device");
  });

  it("flags drops and spikes, scaled to the elapsed part of the hour", () => {
    expect(evaluateFlowWindow({ observed: 60, baseline, fraction: 0.5 })?.kind).toBe("flow_drop");
    expect(evaluateFlowWindow({ observed: 900, baseline, fraction: 0.5 })?.kind).toBe("flow_spike");
    expect(evaluateFlowWindow({ observed: 250, baseline, fraction: 0.5 })).toBeNull();
  });

  it("ignores sparse baselines and low-volume sensors", () => {
    expect(evaluateFlowWindow({ observed: 0, baseline: [500, 500], fraction: 1 })).toBeNull();
    expect(evaluateFlowWindow({ observed: 0, baseline: [8, 10, 9, 7], fraction: 1 })).toBeNull();
  });
});

describe("detectFlowAnomalies", () => {
  const equipment = makeEquipment({ id: 7, type: "radar", street: "Avenida Tiradentes" });

  it("prefers the current hour when enough of it has elapsed", () => {
    const [anomaly] = detectFlowAnomalies(
      [
        {
          equipment,
          lastHour: { observed: 505, baseline, fraction: 1 },
          currentHour: { observed: 0, baseline, fraction: 0.5 },
        },
      ],
      NOW,
    );
    expect(anomaly?.kind).toBe("silent_device");
    expect(anomaly?.id).toBe("silent_device-7");
    expect(anomaly?.detail).toContain("nesta hora até agora");
  });

  it("falls back to the last complete hour early in the hour", () => {
    const [anomaly] = detectFlowAnomalies(
      [
        {
          equipment,
          lastHour: { observed: 1600, baseline, fraction: 1 },
          currentHour: { observed: 0, baseline, fraction: 0.1 },
        },
      ],
      NOW,
    );
    expect(anomaly?.kind).toBe("flow_spike");
    expect(anomaly?.title).toContain("Avenida Tiradentes");
  });

  it("returns nothing when both windows are normal or missing", () => {
    expect(detectFlowAnomalies([{ equipment, lastHour: null, currentHour: null }], NOW)).toEqual(
      [],
    );
  });
});

describe("detectOccurrenceSpikes", () => {
  it("flags improbable concentrations only", () => {
    const spikes = detectOccurrenceSpikes(
      [
        { neighborhoodId: "a", name: "Bairro A", observed: 6, expected: 0.5 },
        { neighborhoodId: "b", name: "Bairro B", observed: 6, expected: 5 },
        { neighborhoodId: "c", name: "Bairro C", observed: 2, expected: 0.01 },
      ],
      NOW,
    );
    expect(spikes.map((item) => item.neighborhoodId)).toEqual(["a"]);
    expect(spikes[0]!.detail).toContain("6 ocorrências");
  });
});
