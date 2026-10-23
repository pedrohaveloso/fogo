import { describe, expect, it } from "vitest";
import { formatMaintenanceDue, plural } from "./text.ts";

describe("plural", () => {
  it("uses the singular from one up to, but not including, two", () => {
    expect(plural(1, "dia", "dias")).toBe("dia");
    expect(plural(1.9, "ocorrência", "ocorrências")).toBe("ocorrência");
    expect(plural(0.4, "ponto", "pontos")).toBe("ponto");
    expect(plural(-1, "ponto", "pontos")).toBe("ponto");
  });

  it("uses the plural for zero and from two on", () => {
    expect(plural(0, "dia", "dias")).toBe("dias");
    expect(plural(2, "dia", "dias")).toBe("dias");
    expect(plural(-3.5, "ponto", "pontos")).toBe("pontos");
  });
  it("describes when maintenance is due with correct plurals", () => {
    expect(formatMaintenanceDue(-12)).toBe("vencida há 12 dias");
    expect(formatMaintenanceDue(-1)).toBe("vencida há 1 dia");
    expect(formatMaintenanceDue(0)).toBe("hoje");
    expect(formatMaintenanceDue(1)).toBe("amanhã");
    expect(formatMaintenanceDue(5)).toBe("em 5 dias");
  });
});
