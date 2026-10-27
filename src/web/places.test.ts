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

const IBGE_DOWN = new PlaceServiceError("O IBGE não respondeu. Tente de novo em instantes.");
const OSM_DOWN = new PlaceServiceError("O OpenStreetMap não respondeu.");

const triangle = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

const marilia = {
  osm_type: "relation",
  lat: "-22.3",
  lon: "-50.1",
  extratags: { "IBGE:GEOCODIGO": "3529005" },
  geojson: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [-50, -22],
          [-49.9, -22],
          [-49.9, -22.1],
          [-50, -22],
        ],
      ],
      [
        [
          [-50.2, -22.1],
          [-49.8, -22.1],
          [-49.8, -22.5],
          [-50.2, -22.5],
          [-50.2, -22.1],
        ],
      ],
    ],
  },
};

describe("municipality list", () => {
  it("maps the IBGE list and asks only once per state", async () => {
    const fetchImpl = respond([{ id: 3529005, nome: "Marília" }]);
    const municipalities = createMunicipalityCache(fetchImpl);
    expect(await municipalities("SP")).toEqual([{ ibgeCode: 3529005, name: "Marília" }]);
    await municipalities("SP");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/estados/SP/municipios");
  });

  it("explains that the IBGE did not answer when the request times out", async () => {
    const municipalities = createMunicipalityCache(
      reject(new DOMException("The operation timed out.", "TimeoutError")),
    );
    await expect(municipalities("SP")).rejects.toThrow(IBGE_DOWN);
  });

  it("explains that the IBGE did not answer when the network fails", async () => {
    const municipalities = createMunicipalityCache(reject(new TypeError("Failed to fetch")));
    await expect(municipalities("SP")).rejects.toThrow(IBGE_DOWN);
  });

  it("does not cache a refused answer", async () => {
    const fetchImpl = respond({}, 503);
    const municipalities = createMunicipalityCache(fetchImpl);
    await expect(municipalities("SP")).rejects.toThrow(IBGE_DOWN);
    await expect(municipalities("SP")).rejects.toThrow(PlaceServiceError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("boundary lookup", () => {
  it("picks the result with the IBGE code and keeps its largest polygon", async () => {
    const wrongCode = {
      osm_type: "relation",
      extratags: { "IBGE:GEOCODIGO": "352900505" },
      geojson: triangle,
    };
    const found = await lookupBoundary(respond([wrongCode, marilia]), "Marília", "SP", 3529005);
    expect(found?.boundary).toHaveLength(4);
    expect(found?.center).toEqual([-50.1, -22.3]);
  });

  it("falls back to a municipal boundary when no result carries the IBGE code", async () => {
    const unnamed = { ...marilia, extratags: { admin_level: "8" } };
    const found = await lookupBoundary(respond([unnamed]), "Marília", "SP", 3529005);
    expect(found?.boundary).toHaveLength(4);
  });

  it("uses the middle of the boundary when the place point falls outside it", async () => {
    const far = { ...marilia, lat: "-10", lon: "-40" };
    const found = await lookupBoundary(respond([far]), "Marília", "SP", 3529005);
    expect(found?.center).not.toEqual([-40, -10]);
    expect(found?.center[0]).toBeCloseTo(-50, 0);
  });

  it("returns nothing when no result is the municipality", async () => {
    expect(await lookupBoundary(respond([]), "Marília", "SP", 3529005)).toBeNull();
  });

  it("explains that the OpenStreetMap did not answer when it refuses", async () => {
    await expect(lookupBoundary(respond({}, 429), "Marília", "SP", 3529005)).rejects.toThrow(
      OSM_DOWN,
    );
  });

  it("treats a broken body as a service failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 }));
    await expect(lookupBoundary(fetchImpl, "Marília", "SP", 3529005)).rejects.toThrow(OSM_DOWN);
  });
});
