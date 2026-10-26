import { describe, expect, it } from "vitest";
import { mariliaCity } from "./test-database.ts";
import {
  ValidationError,
  parseAgentInput,
  parseCityBoundary,
  parseEquipmentInput,
  parseId,
  parseLogin,
  parseNeighborhoodShape,
  parseNewCity,
  parseNewNeighborhood,
  parseOccurrenceInput,
  parsePasswordChange,
  parseUserInput,
} from "./validation.ts";

const city = mariliaCity();
const cityOf = (id: number) => (id === city.city.id ? city : undefined);

const equipment = {
  type: "radar",
  serialNumber: " RAD-1 ",
  brand: "Velox",
  model: "VX",
  cityId: 1,
  agencyId: 1,
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
    const parsed = parseEquipmentInput(equipment, cityOf);
    expect(parsed.serialNumber).toBe("RAD-1");
    expect(parsed.cep).toBe("17500-000");
    expect(parsed.cityId).toBe(1);
    expect(parsed.attributes).toEqual({ enforcement: "speed", speedLimit: 60 });
  });

  it("reports required fields and unknown neighborhoods", () => {
    const result = issues(() =>
      parseEquipmentInput({ ...equipment, serialNumber: "", neighborhoodId: "atlantida" }, cityOf),
    );
    expect(result["serialNumber"]).toBe("Digite o número de série");
    expect(result["neighborhoodId"]).toBe("Selecione um bairro da lista");
  });

  it("tells how to fix empty location fields", () => {
    const result = issues(() =>
      parseEquipmentInput(
        { ...equipment, neighborhoodId: "", lat: null, lng: null, cep: "" },
        cityOf,
      ),
    );
    expect(result["neighborhoodId"]).toBe("Selecione o bairro");
    expect(result["lat"]).toBe("Clique no mapa ou digite a latitude");
    expect(result["lng"]).toBe("Clique no mapa ou digite a longitude");
    expect(result["cep"]).toBe("Digite o CEP");
  });

  it("rejects coordinates outside the city and malformed CEP", () => {
    expect(issues(() => parseEquipmentInput({ ...equipment, lat: -23.5 }, cityOf))["lat"]).toBe(
      "Escolha um ponto dentro de Marília, clicando no mapa",
    );
    expect(issues(() => parseEquipmentInput({ ...equipment, cep: "1750" }, cityOf))["cep"]).toBe(
      "Digite o CEP com 8 números, como 17500-000",
    );
  });

  it("checks the city and the agency against what the user can see", () => {
    expect(issues(() => parseEquipmentInput({ ...equipment, cityId: 2 }, cityOf))["cityId"]).toBe(
      "Selecione uma cidade da lista",
    );
    expect(
      issues(() => parseEquipmentInput({ ...equipment, cityId: null }, cityOf))["cityId"],
    ).toBe("Selecione a cidade");
    const result = issues(() => parseEquipmentInput({ ...equipment, agencyId: 99 }, cityOf));
    expect(result["agencyId"]).toBe("Selecione um órgão da lista");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, agencyId: undefined }, cityOf))["agencyId"],
    ).toBe("Selecione o órgão responsável");
  });

  it("enforces consistency between status, installation and maintenance dates", () => {
    expect(
      issues(() => parseEquipmentInput({ ...equipment, installedAt: null }, cityOf))["installedAt"],
    ).toBe("Informe a data de instalação");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, status: "not_installed" }, cityOf))[
        "installedAt"
      ],
    ).toContain("não instalado");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, nextMaintenanceAt: null }, cityOf))[
        "nextMaintenanceAt"
      ],
    ).toBe("Informe a data da próxima manutenção");
    expect(
      issues(() => parseEquipmentInput({ ...equipment, nextMaintenanceAt: "2026-08-01" }, cityOf))[
        "nextMaintenanceAt"
      ],
    ).toContain("anterior");
  });

  it("validates attributes against the equipment type", () => {
    const result = issues(() =>
      parseEquipmentInput(
        { ...equipment, attributes: { enforcement: "drone", speedLimit: 500 } },
        cityOf,
      ),
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
    agencyId: 1,
    shift: "morning",
    status: "available",
    baseName: "Base Centro",
    baseNeighborhoodId: "centro",
    lat: -22.21,
    lng: -49.94,
  };

  it("fills optional fields", () => {
    expect(parseAgentInput(agent, city)).toMatchObject({ rank: "", phone: "", vehicleId: null });
  });

  it("rejects invalid roles and short names", () => {
    const result = issues(() => parseAgentInput({ ...agent, role: "astronaut", name: "Al" }, city));
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
    expect(parseOccurrenceInput(valid, city).severity).toBe(4);
    expect(issues(() => parseOccurrenceInput({ ...valid, severity: 5 }, city))["severity"]).toBe(
      "Gravidade inválida",
    );
  });
});

describe("parseNeighborhoodShape", () => {
  const square = [
    [-49.95, -22.21],
    [-49.94, -22.21],
    [-49.94, -22.2],
    [-49.95, -22.2],
  ];

  it("closes rings, rounds points and stays near the city", () => {
    expect(parseNeighborhoodShape({ polygon: [...square, square[0]] }, city)).toHaveLength(4);
    expect(
      issues(() => parseNeighborhoodShape({ polygon: [[-46.6, -23.5], ...square.slice(1)] }, city))[
        "polygon.0.0"
      ],
    ).toBe("O desenho passou dos limites de Marília");
    expect(
      issues(() => parseNeighborhoodShape({ polygon: square.slice(0, 2) }, city))["polygon"],
    ).toBe("O bairro precisa de ao menos 3 pontos");
  });

  it("asks for a zone of the city when creating a neighborhood", () => {
    expect(
      issues(() => parseNewNeighborhood({ name: "Vila", regionId: "", polygon: square }, city))[
        "regionId"
      ],
    ).toBe("Selecione a zona");
    expect(
      issues(() => parseNewNeighborhood({ name: "Vila", regionId: "lua", polygon: square }, city))[
        "regionId"
      ],
    ).toBe("Selecione uma zona da lista");
  });
});

describe("parseNewCity", () => {
  const boundary = [
    [-49.9, -22.1],
    [-49.8, -22.1],
    [-49.8, -22.2],
  ];

  it("needs a municipality, a state and a drawn boundary", () => {
    expect(parseNewCity({ ibgeCode: 3529005, name: "Marília", uf: "SP", boundary })).toMatchObject({
      ibgeCode: 3529005,
      uf: "SP",
    });
    const result = issues(() => parseNewCity({ ibgeCode: 12, name: "", uf: "XX", boundary: [] }));
    expect(result["ibgeCode"]).toBe("Selecione o município");
    expect(result["uf"]).toBe("Selecione a UF");
    expect(result["boundary"]).toBe("O limite precisa de ao menos 3 pontos");
    expect(parseCityBoundary({ boundary })).toHaveLength(3);
  });
});

describe("users and sessions", () => {
  const user = { username: "ana.souza", name: "Ana Souza", role: "user", cityIds: [1] };

  it("requires a password only when creating", () => {
    expect(parseUserInput(user, false)).toMatchObject({ password: null, cityIds: [1] });
    expect(issues(() => parseUserInput(user, true))["password"]).toBe("Digite a senha");
    expect(issues(() => parseUserInput({ ...user, password: "curta" }, true))["password"]).toBe(
      "A senha precisa ter ao menos 8 caracteres",
    );
  });

  it("rejects odd usernames and unknown roles", () => {
    const result = issues(() =>
      parseUserInput({ ...user, username: "ana souza", role: "chefe" }, false),
    );
    expect(result["username"]).toContain("letras sem acento");
    expect(result["role"]).toBe("Selecione o perfil");
  });

  it("asks for both login fields and a long enough new password", () => {
    const login = issues(() => parseLogin({ username: " ", password: "" }));
    expect(login).toMatchObject({ username: "Digite o usuário", password: "Digite a senha" });
    expect(issues(() => parsePasswordChange({ current: "x", next: "123" }))["next"]).toBe(
      "A senha precisa ter ao menos 8 caracteres",
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
