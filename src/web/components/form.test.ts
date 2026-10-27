import { describe, expect, it } from "vitest";
import { ApiError } from "../api.ts";
import { removalError } from "./form.tsx";

describe("removal errors", () => {
  it("shows the reason the server gave as a message for the whole form", () => {
    const error = new ApiError(409, "Órgão em uso", [
      { path: "id", message: "Há equipamentos ou agentes deste órgão." },
    ]);
    expect(removalError(error, "Não foi possível excluir.")).toEqual({
      form: "Há equipamentos ou agentes deste órgão.",
    });
  });

  it("falls back to the error title when the server sends no detail", () => {
    expect(removalError(new ApiError(404, "Órgão não encontrado", []), "x")).toEqual({
      form: "Órgão não encontrado",
    });
  });

  it("uses the fallback for failures that did not come from the API", () => {
    expect(removalError(new TypeError("fetch failed"), "Não foi possível excluir.")).toEqual({
      form: "Não foi possível excluir.",
    });
  });
});
