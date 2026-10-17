import { describe, expect, it, vi } from "vitest";
import { lookupAddress, normalizeCep } from "./address.ts";
import { city } from "./city.ts";

const localStreet = city.streets[0]!;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeCep", () => {
  it("formats eight digits and rejects anything else", () => {
    expect(normalizeCep("17500000")).toBe("17500-000");
    expect(normalizeCep("17.500-000")).toBe("17500-000");
    expect(normalizeCep("1750")).toBeNull();
  });
});

describe("lookupAddress", () => {
  it("answers from the local dataset without calling ViaCEP", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await lookupAddress(city, localStreet.cep, fetchImpl);
    expect(result).toMatchObject({
      street: localStreet.name,
      neighborhoodId: localStreet.neighborhoodId,
      source: "local",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a ViaCEP answer to a known neighborhood", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        cep: "17519-999",
        logradouro: "Rua Nova",
        bairro: "Fragata",
        localidade: "Marília",
        uf: "SP",
      }),
    );
    const result = await lookupAddress(city, "17519999", fetchImpl);
    expect(result).toMatchObject({ neighborhoodId: "fragata", source: "viacep", city: "Marília" });
    expect(result?.lat).not.toBeNull();
  });

  it("returns null for unknown CEP, HTTP errors, network failures and invalid input", async () => {
    expect(
      await lookupAddress(
        city,
        "17519998",
        vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ erro: true })),
      ),
    ).toBeNull();
    expect(
      await lookupAddress(
        city,
        "17519998",
        vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500)),
      ),
    ).toBeNull();
    expect(
      await lookupAddress(
        city,
        "17519998",
        vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
      ),
    ).toBeNull();
    expect(await lookupAddress(city, "abc", vi.fn<typeof fetch>())).toBeNull();
  });

  it("keeps the address when the neighborhood is not in the registry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        cep: "17519-997",
        logradouro: "Rua Inexistente",
        bairro: "Bairro Novo",
        localidade: "Marília",
        uf: "SP",
      }),
    );
    const result = await lookupAddress(city, "17519997", fetchImpl);
    expect(result).toMatchObject({
      neighborhoodId: null,
      neighborhoodName: "Bairro Novo",
      lat: null,
    });
  });
});
