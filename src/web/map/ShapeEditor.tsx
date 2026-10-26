import type { GeoJSONSource, MapLayerMouseEvent, MapLayerTouchEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import type { LngLat } from "../../shared/geo.ts";
import type { Neighborhood } from "../../shared/types.ts";
import { insertVertex, midpoints, moveVertex } from "../shapeEditing.ts";
import { NEIGHBORHOOD_ATTRIBUTION, cameraMotion, useMap } from "./base.ts";
import { neighborhoodFeatures } from "./geojson.ts";
import { MAP_AREA_LINE, MAP_INK, MAP_SURFACE } from "./palette.ts";

type Props = {
  center: LngLat;
  neighborhoods: readonly Neighborhood[];
  selectedId: string | null;
  polygon: LngLat[];
  drawing: boolean;
  selectedVertex: number | null;
  onChange: (polygon: LngLat[]) => void;
  onSelectVertex: (index: number | null) => void;
  onSelectNeighborhood: (id: string) => void;
  onRemoveVertex: (index: number) => void;
  onFinishDrawing: () => void;
};

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const DRAFT_FILL = "#ffc20e";
const VERTEX_LAYERS = ["shape-vertices", "shape-midpoints"];

function draftFeatures(polygon: LngLat[], drawing: boolean) {
  if (polygon.length === 0) {
    return EMPTY;
  }
  const closed = !drawing && polygon.length >= 3;
  return {
    type: "FeatureCollection" as const,
    features: [
      closed
        ? {
            type: "Feature" as const,
            geometry: { type: "Polygon" as const, coordinates: [[...polygon, polygon[0]!]] },
            properties: {},
          }
        : {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: polygon },
            properties: {},
          },
    ],
  };
}

function pointFeatures(points: LngLat[], selected: number | null) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point, index) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: point },
      properties: { index, selected: index === selected },
    })),
  };
}

function featureIndex(event: MapLayerMouseEvent | MapLayerTouchEvent): number | null {
  const value = event.features?.[0]?.properties["index"];
  return typeof value === "number" ? value : null;
}

export function ShapeEditor(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useMap(container, { center: props.center, zoom: 13 });
  const read = useEffectEvent(() => props);
  const dragging = useRef<{ index: number; polygon: LngLat[] } | null>(null);

  const startDrag = useEffectEvent((layer: string, index: number) => {
    const { polygon, onChange, onSelectVertex } = read();
    if (layer === "shape-midpoints") {
      const inserted = insertVertex(polygon, index, midpoints(polygon)[index]!);
      onChange(inserted);
      dragging.current = { index: index + 1, polygon: inserted };
      onSelectVertex(index + 1);
      return;
    }
    dragging.current = { index, polygon };
    onSelectVertex(index);
  });

  const drag = useEffectEvent((point: LngLat) => {
    const current = dragging.current;
    if (current === null) {
      return;
    }
    current.polygon = moveVertex(current.polygon, current.index, point);
    read().onChange(current.polygon);
  });

  const click = useEffectEvent((event: MapLayerMouseEvent) => {
    const map = handle?.map;
    if (!map) {
      return;
    }
    const current = read();
    const point: LngLat = [event.lngLat.lng, event.lngLat.lat];
    if (current.drawing) {
      const first = map.queryRenderedFeatures(event.point, { layers: ["shape-vertices"] })[0];
      if (first?.properties["index"] === 0 && current.polygon.length >= 3) {
        current.onFinishDrawing();
      } else {
        current.onChange([...current.polygon, point]);
      }
      return;
    }
    const vertex = map.queryRenderedFeatures(event.point, { layers: VERTEX_LAYERS })[0];
    if (vertex) {
      return;
    }
    const area = map.queryRenderedFeatures(event.point, { layers: ["shape-areas-fill"] })[0];
    const id = area?.properties["id"];
    if (typeof id === "string" && id !== current.selectedId) {
      current.onSelectNeighborhood(id);
    } else {
      current.onSelectVertex(null);
    }
  });

  const removeAt = useEffectEvent((index: number) => read().onRemoveVertex(index));

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    map.doubleClickZoom.disable();
    map.addSource("shape-areas", {
      type: "geojson",
      data: EMPTY,
      attribution: NEIGHBORHOOD_ATTRIBUTION,
    });
    map.addSource("shape-draft", { type: "geojson", data: EMPTY });
    map.addSource("shape-midpoints", { type: "geojson", data: EMPTY });
    map.addSource("shape-vertices", { type: "geojson", data: EMPTY });
    map.addLayer({
      id: "shape-areas-fill",
      type: "fill",
      source: "shape-areas",
      paint: { "fill-color": MAP_INK, "fill-opacity": 0.02 },
    });
    map.addLayer({
      id: "shape-areas-line",
      type: "line",
      source: "shape-areas",
      paint: { "line-color": MAP_AREA_LINE, "line-width": 1 },
    });
    map.addLayer({
      id: "shape-draft-fill",
      type: "fill",
      source: "shape-draft",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": DRAFT_FILL, "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: "shape-draft-line",
      type: "line",
      source: "shape-draft",
      paint: { "line-color": MAP_INK, "line-width": 2 },
    });
    map.addLayer({
      id: "shape-midpoints",
      type: "circle",
      source: "shape-midpoints",
      paint: {
        "circle-radius": 4,
        "circle-color": MAP_SURFACE,
        "circle-opacity": 0.85,
        "circle-stroke-color": MAP_INK,
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.6,
      },
    });
    map.addLayer({
      id: "shape-vertices",
      type: "circle",
      source: "shape-vertices",
      paint: {
        "circle-radius": ["case", ["get", "selected"], 7, 5.5],
        "circle-color": ["case", ["get", "selected"], MAP_INK, MAP_SURFACE],
        "circle-stroke-color": MAP_INK,
        "circle-stroke-width": 2,
      },
    });

    const down = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
      if (read().drawing) {
        return;
      }
      if ("points" in event && event.points.length !== 1) {
        return;
      }
      const index = featureIndex(event);
      const layer = event.features?.[0]?.layer.id;
      if (index === null || !layer) {
        return;
      }
      event.preventDefault();
      startDrag(layer, index);
    };
    const move = (event: { lngLat: { lng: number; lat: number } }) =>
      drag([event.lngLat.lng, event.lngLat.lat]);
    const up = () => {
      dragging.current = null;
    };
    for (const layer of VERTEX_LAYERS) {
      map.on("mousedown", layer, down);
      map.on("touchstart", layer, down);
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "grab";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = read().drawing ? "crosshair" : "";
      });
    }
    map.on("mousemove", move);
    map.on("touchmove", move);
    map.on("mouseup", up);
    map.on("touchend", up);
    map.on("click", click);
    map.on("dblclick", "shape-vertices", (event) => {
      const index = featureIndex(event);
      if (index !== null && !read().drawing) {
        event.preventDefault();
        removeAt(index);
      }
    });
  }, [handle]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const others = props.neighborhoods.filter((item) => item.id !== props.selectedId);
    (handle.map.getSource("shape-areas") as GeoJSONSource).setData(neighborhoodFeatures(others));
  }, [handle, props.neighborhoods, props.selectedId]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    (map.getSource("shape-draft") as GeoJSONSource).setData(
      draftFeatures(props.polygon, props.drawing),
    );
    (map.getSource("shape-vertices") as GeoJSONSource).setData(
      pointFeatures(props.polygon, props.selectedVertex),
    );
    (map.getSource("shape-midpoints") as GeoJSONSource).setData(
      props.drawing || props.polygon.length < 3
        ? EMPTY
        : pointFeatures(midpoints(props.polygon), null),
    );
    map.getCanvas().style.cursor = props.drawing ? "crosshair" : "";
  }, [handle, props.polygon, props.drawing, props.selectedVertex]);

  useEffect(() => {
    if (!handle || props.selectedId === null) {
      return;
    }
    const { polygon } = read();
    if (polygon.length < 3) {
      return;
    }
    const lngs = polygon.map(([lng]) => lng);
    const lats = polygon.map(([, lat]) => lat);
    handle.map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, maxZoom: 16, ...cameraMotion() },
    );
  }, [handle, props.selectedId]);

  return (
    <div className="shape-map">
      <div
        ref={container}
        className="map"
        role="application"
        aria-label="Mapa de edição do bairro. Arraste os pontos para mudar o limite."
      />
    </div>
  );
}
