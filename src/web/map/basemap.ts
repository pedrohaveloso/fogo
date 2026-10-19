import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

const MAP_GROUND = "#111417";

const PLACE_PAINT = { "text-color": "#858d97", "text-halo-color": "rgba(17,20,23,0.85)" };

const RAILWAY_PAINT = { "line-color": "#2a2f35" };

const BASEMAP_PAINT: Record<string, Record<string, string>> = {
  background: { "background-color": MAP_GROUND },
  water: { "fill-color": "#13202a" },
  waterway: { "line-color": "#13202a" },
  water_name: { "text-color": "#4f6575", "text-halo-color": MAP_GROUND },
  landuse_residential: { "fill-color": "#14171b" },
  landcover_wood: { "fill-color": "#141a18" },
  landuse_park: { "fill-color": "#141a18" },
  building: { "fill-color": "#171b20", "fill-outline-color": "#1e2329" },
  highway_path: { "line-color": "#1c2025" },
  highway_minor: { "line-color": "#22272d" },
  highway_major_casing: { "line-color": "#30363e" },
  highway_major_inner: { "line-color": "#262b31" },
  highway_major_subtle: { "line-color": "#2b3037" },
  highway_motorway_casing: { "line-color": "#3a414a" },
  highway_motorway_inner: { "line-color": "#2c3239" },
  highway_motorway_subtle: { "line-color": "#262b31" },
  railway: RAILWAY_PAINT,
  railway_minor: RAILWAY_PAINT,
  railway_transit: RAILWAY_PAINT,
  highway_name_other: { "text-color": "#69717b", "text-halo-color": MAP_GROUND },
  highway_name_motorway: { "text-color": "#7d858f", "text-halo-color": MAP_GROUND },
};

function paintFor(id: string): Record<string, string> | undefined {
  return BASEMAP_PAINT[id] ?? (id.startsWith("place_") ? PLACE_PAINT : undefined);
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
