import { describe, expect, it, vi } from "vitest";
import { createMunicipalityCache, lookupBoundary, PlaceServiceError } from "./places.ts";

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

function reject(error: unknown) {
  return vi.fn<typeof fetch>(async () => {
    throw error;
  });
}

describe("municipality list", () => {
  it("maps the IBGE list and asks only once per state", async () => {
    const fetchImpl = respond([{ id: 3529005, nome: "Marília" }]);
    const municipalities = createMunicipalityCache(fetchImpl);
    expect(await municipalities("SP")).toEqual([{ ibgeCode: 3529005, name: "Marília" }]);
    await municipalities("SP");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("names the service and the time limit when it does not answer", async () => {
    const municipalities = createMunicipalityCache(
      reject(new DOMException("The operation timed out.", "TimeoutError")),
    );
    await expect(municipalities("SP")).rejects.toThrow(
      new PlaceServiceError("IBGE: sem resposta em 30 s"),
    );
  });

  it("names the service and the network error", async () => {
    const municipalities = createMunicipalityCache(reject(new TypeError("fetch failed")));
    await expect(municipalities("SP")).rejects.toThrow("IBGE: fetch failed");
  });

  it("does not cache a failed answer", async () => {
    const fetchImpl = respond({}, 503);
    const municipalities = createMunicipalityCache(fetchImpl);
    await expect(municipalities("SP")).rejects.toThrow("IBGE: HTTP 503");
    await expect(municipalities("SP")).rejects.toThrow(PlaceServiceError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("boundary lookup", () => {
  it("names the service and the HTTP status of a refusal", async () => {
    await expect(lookupBoundary(respond({}, 429), "Marília", "SP", 3529005)).rejects.toThrow(
      new PlaceServiceError("Nominatim: HTTP 429"),
    );
  });

  it("treats a broken body as a service failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }));
    await expect(lookupBoundary(fetchImpl, "Marília", "SP", 3529005)).rejects.toThrow(
      /^Nominatim: /,
    );
  });

  it("returns nothing when no result is the municipality", async () => {
    expect(await lookupBoundary(respond([]), "Marília", "SP", 3529005)).toBeNull();
  });
});
