import { describe, expect, it } from "vitest";
import { pageTitle } from "./pageTitle.ts";

describe("pageTitle", () => {
  it("names each screen, including forms", () => {
    expect(pageTitle("/")).toBe("Central de operações: F.O.G.O. Marília");
    expect(pageTitle("/equipamentos/novo")).toBe("Cadastrar equipamento: F.O.G.O. Marília");
    expect(pageTitle("/equipamentos/12")).toBe("Editar equipamento: F.O.G.O. Marília");
    expect(pageTitle("/agentes/30")).toBe("Editar agente: F.O.G.O. Marília");
    expect(pageTitle("/previsoes")).toBe("Cidade preditiva: F.O.G.O. Marília");
  });

  it("says when a page does not exist", () => {
    expect(pageTitle("/pagina-x")).toBe("Página não encontrada: F.O.G.O. Marília");
    expect(pageTitle("/equipamentos/abc")).toBe("Página não encontrada: F.O.G.O. Marília");
  });
});
