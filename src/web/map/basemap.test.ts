import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { tintBasemap } from "./basemap.ts";

const style: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background", paint: { "background-color": "rgb(12,12,12)" } },
    {
      id: "highway_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#181818", "line-width": 2 },
    },
    {
      id: "place_suburb",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      paint: { "text-color": "rgb(101,101,101)" },
    },
    {
      id: "custom_layer",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": "#ff0000" },
    },
  ],
};

describe("tintBasemap", () => {
  it("repaints known layers with the asphalt palette and keeps other paint values", () => {
    const tinted = tintBasemap(style);
    expect(tinted.layers[0]).toMatchObject({ paint: { "background-color": "#111417" } });
    expect(tinted.layers[1]).toMatchObject({ paint: { "line-color": "#22272d", "line-width": 2 } });
    expect(tinted.layers[2]).toMatchObject({ paint: { "text-color": "#858d97" } });
  });

  it("leaves unknown layers and the original style untouched", () => {
    const tinted = tintBasemap(style);
    expect(tinted.layers[3]).toBe(style.layers[3]);
    expect(style.layers[0]).toMatchObject({ paint: { "background-color": "rgb(12,12,12)" } });
  });

  it("handles a style without layers to repaint", () => {
    expect(tintBasemap({ version: 8, sources: {}, layers: [] }).layers).toEqual([]);
  });
});
