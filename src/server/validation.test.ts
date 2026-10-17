import { describe, expect, it } from "vitest";
import {
  ValidationError,
  parseAgentInput,
  parseEquipmentInput,
  parseId,
  parseOccurrenceInput,
} from "./validation.ts";

const equipment = {
  type: "radar",
  serialNumber: " RAD-1 ",
  brand: "Velox",
  model: "VX",
  agency: "mobility",
  status: "operational",
  cep: "17500000",
  street: "Avenida Sampaio Vidal",
  reference: "número 10",
  neighborhoodId: "centro",
  lat: -22.21,
  lng: -49.94,
  maintenanceNeed: "scheduled",
  maintenanceIntervalDays: 180,
  lastMaintenanceAt: "2026-09-01",
  nextMaintenanceAt: "2027-02-28",
  installedAt: "2025-01-01",
  attributes: { enforcement: "speed", speedLimit: 60, unknown: "x", lanes: "" },
};

function issues(run: () => unknown): Record<string, string> {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationError) {
      return Object.fromEntries(error.issues.map((issue) => [issue.path, issue.message]));
    }
    throw error;
  }
  throw new Error("Era esperado um erro de validação");
}

describe("parseEquipmentInput", () => {
  it("normalizes valid input and keeps only known attributes", () => {
    const parsed = parseEquipmentInput(equipment);
    expect(parsed.serialNumber).toBe("RAD-1");
    expect(parsed.cep).toBe("17500-000");
    expect(parsed.city).toBe("Marília");
    expect(parsed.attributes).toEqual({ enforcement: "speed", speedLimit: 60 });
  });

  it("reports required fields and unknown neighborhoods", () => {
    const result = issues(() =>
      parseEquipmentInput({ ...equipment, serialNumber: "", neighborhoodId: "atlantida" }),
    );
    expect(result["serialNumber"]).toBe("Campo obrigatório");
    expect(result["neighborhoodId"]).toBe("Bairro não cadastrado");
  });

  it("rejects coordinates outside Marília and malformed CEP", () => {
    const result = issues(() => parseEquipmentInput({ ...equipment, lat: -23.5, cep: "1750" }));
    expect(result["lat"]).toBe("Coordenadas fora da área de Marília");
    expect(result["cep"]).toBe("CEP deve ter 8 dígitos");
  });

  it("enforces consistency between status, installation and maintenance dates", () => {
    expect(
      issues(() => parseEquipmentInput({ ...equipment, installedAt: null }))["installedAt"],
    ).toBe("Informe a data de instalação");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, status: "not_installed" }))["installedAt"],
    ).toContain("não instalado");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, nextMaintenanceAt: null }))[
        "nextMaintenanceAt"
      ],
    ).toBe("Informe a data da próxima manutenção");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, nextMaintenanceAt: "2026-08-01" }))[
        "nextMaintenanceAt"
      ],
    ).toContain("anterior");
  });

  it("validates attributes against the equipment type", () => {
    const result = issues(() =>
      parseEquipmentInput({ ...equipment, attributes: { enforcement: "drone", speedLimit: 500 } }),
    );
    expect(result["attributes.enforcement"]).toBe("Fiscalização: opção inválida");
    expect(result["attributes.speedLimit"]).toBe("Velocidade máxima: máximo 120");
  });
});

describe("parseAgentInput", () => {
  const agent = {
    name: "Ana Souza",
    badge: "AT-9",
    role: "traffic_agent",
    shift: "morning",
    status: "available",
    baseName: "Base Centro",
    baseNeighborhoodId: "centro",
    lat: -22.21,
    lng: -49.94,
  };

  it("fills optional fields", () => {
    expect(parseAgentInput(agent)).toMatchObject({ rank: "", phone: "", vehicleId: null });
  });

  it("rejects invalid roles and short names", () => {
    const result = issues(() => parseAgentInput({ ...agent, role: "astronaut", name: "Al" }));
    expect(result["role"]).toBe("Função inválida");
    expect(result["name"]).toContain("ao menos 3");
  });
});

describe("parseOccurrenceInput", () => {
  it("accepts only severities from 1 to 4", () => {
    const valid = {
      kind: "accident",
      severity: 4,
      neighborhoodId: "centro",
      lat: -22.21,
      lng: -49.94,
      description: "Colisão",
    };
    expect(parseOccurrenceInput(valid).severity).toBe(4);
    expect(issues(() => parseOccurrenceInput({ ...valid, severity: 5 }))["severity"]).toBe(
      "Gravidade inválida",
    );
  });
});

describe("parseId", () => {
  it("accepts positive integers only", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId("0")).toBeNull();
    expect(parseId("abc")).toBeNull();
    expect(parseId("1.5")).toBeNull();
  });
});
