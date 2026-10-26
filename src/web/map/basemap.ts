import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { MAP_GROUND } from "./palette.ts";

const HALO = "rgba(255,255,255,0.9)";

const LABEL_PAINT = { "text-color": "#7a828c", "text-halo-color": HALO };

const RAILWAY_PAINT = { "line-color": "#d3d7dc" };

const BASEMAP_PAINT: Record<string, Record<string, string>> = {
  background: { "background-color": MAP_GROUND },
  park: { "fill-color": "#e3e8e2" },
  water: { "fill-color": "#c9d3db" },
  waterway: { "line-color": "#bccad4" },
  landuse_residential: { "fill-color": "#e7e9ec" },
  landcover_wood: { "fill-color": "#dfe5df" },
  building: { "fill-color": "#e2e5e9", "fill-outline-color": "#d6dade" },
  highway_path: { "line-color": "#e4e7ea" },
  highway_minor: { "line-color": "#ffffff" },
  highway_major_casing: { "line-color": "#cfd4d9" },
  highway_major_inner: { "line-color": "#ffffff" },
  highway_motorway_casing: { "line-color": "#c3c9cf" },
  railway: RAILWAY_PAINT,
  railway_transit: RAILWAY_PAINT,
  railway_service: RAILWAY_PAINT,
  "highway-name-minor": { "text-color": "#858d97", "text-halo-color": HALO },
  "highway-name-major": { "text-color": "#6f7781", "text-halo-color": HALO },
  water_name_point_label: { "text-color": "#6c7f8f", "text-halo-color": HALO },
  water_name_line_label: { "text-color": "#6c7f8f", "text-halo-color": HALO },
};

function paintFor(id: string): Record<string, string> | undefined {
  return BASEMAP_PAINT[id] ?? (id.startsWith("label_") ? LABEL_PAINT : undefined);
}

export function tintBasemap(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const paint = paintFor(layer.id);
      return paint
        ? ({ ...layer, paint: { ...layer.paint, ...paint } } as LayerSpecification)
        : layer;
    }),
  };
}
