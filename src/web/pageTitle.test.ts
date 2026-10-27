import { describe, expect, it } from "vitest";
import { pageTitle } from "./pageTitle.ts";

describe("pageTitle", () => {
  it("names each screen, including forms, with the current city", () => {
    expect(pageTitle("/", "Marília")).toBe("Central de operações: FOGO Marília");
    expect(pageTitle("/equipment/new", "Marília")).toBe("Cadastrar equipamento: FOGO Marília");
    expect(pageTitle("/equipment/12", "Bauru")).toBe("Editar equipamento: FOGO Bauru");
    expect(pageTitle("/agents/30", "Marília")).toBe("Editar agente: FOGO Marília");
    expect(pageTitle("/neighborhoods", "Marília")).toBe("Bairros: FOGO Marília");
    expect(pageTitle("/predictions", "Marília")).toBe("Cidade preditiva: FOGO Marília");
    expect(pageTitle("/users/4", "Marília")).toBe("Editar usuário: FOGO Marília");
    expect(pageTitle("/management", "Marília")).toBe("Gerenciamento: FOGO Marília");
    expect(pageTitle("/agencies/new", "Marília")).toBe("Cadastrar órgão: FOGO Marília");
    expect(pageTitle("/agencies/3", "Marília")).toBe("Editar órgão: FOGO Marília");
    expect(pageTitle("/docs", "Marília")).toBe("Documentações: FOGO Marília");
  });

  it("leaves the city out when none is chosen", () => {
    expect(pageTitle("/cities/new", null)).toBe("Cadastrar cidade: FOGO");
  });

  it("says when a page does not exist", () => {
    expect(pageTitle("/pagina-x", "Marília")).toBe("Página não encontrada: FOGO Marília");
    expect(pageTitle("/equipment/abc", "Marília")).toBe("Página não encontrada: FOGO Marília");
  });
});
