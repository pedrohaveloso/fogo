import { describe, expect, it } from "vitest";
import { pageTitle } from "./pageTitle.ts";

describe("pageTitle", () => {
  it("names each screen, including forms", () => {
    expect(pageTitle("/")).toBe("Central de operações: FOGO Marília");
    expect(pageTitle("/equipment/new")).toBe("Cadastrar equipamento: FOGO Marília");
    expect(pageTitle("/equipment/12")).toBe("Editar equipamento: FOGO Marília");
    expect(pageTitle("/agents/30")).toBe("Editar agente: FOGO Marília");
    expect(pageTitle("/neighborhoods")).toBe("Bairros: FOGO Marília");
    expect(pageTitle("/predictions")).toBe("Cidade preditiva: FOGO Marília");
  });

  it("says when a page does not exist", () => {
    expect(pageTitle("/pagina-x")).toBe("Página não encontrada: FOGO Marília");
    expect(pageTitle("/equipment/abc")).toBe("Página não encontrada: FOGO Marília");
  });
});
