import { Marker, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import { OCCURRENCE_KINDS, SEVERITY_LABELS } from "../../shared/catalog.ts";
import type { Agent, AreaHealth, Equipment, Meta, Occurrence } from "../../shared/types.ts";
import { HEALTH_COLORS, SEVERITY_COLORS } from "../colors.ts";
import { useMap } from "./base.ts";
import { neighborhoodFeatures } from "./geojson.ts";

export type Selection =
  | { kind: "equipment"; id: number }
  | { kind: "agent"; id: number }
  | { kind: "occurrence"; id: number }
  | { kind: "neighborhood"; id: string };

export type MapLayers = {
  health: boolean;
  equipment: boolean;
  agents: boolean;
  occurrences: boolean;
  heat: boolean;
};

type Props = {
  meta: Meta;
  equipment: Equipment[];
  agents: Agent[];
  occurrences: Occurrence[];
  neighborhoodHealth: AreaHealth[];
  heatPoints: [number, number][];
  layers: MapLayers;
  selected: Selection | null;
  focus: { lng: number; lat: number; key: number } | null;
  onSelect: (selection: Selection | null) => void;
};

const EMPTY = { type: "FeatureCollection" as const, features: [] };

function point(lng: number, lat: number, properties: Record<string, unknown>) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
    properties,
  };
}

function equipmentPosition(item: Equipment): [number, number] {
  return [item.currentLng ?? item.lng, item.currentLat ?? item.lat];
}

export function OperationsMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useMap(container, { center: props.meta.city.center, zoom: 12.4 });
  const onSelect = useEffectEvent((selection: Selection | null) => props.onSelect(selection));
  const markers = useRef(new Map<number, Marker>());

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map, online } = handle;
    map.addSource("neighborhoods", {
      type: "geojson",
      data: neighborhoodFeatures(props.meta.neighborhoods),
      promoteId: "id",
    });
    map.addSource("heat", { type: "geojson", data: EMPTY });
    map.addSource("equipment", {
      type: "geojson",
      data: EMPTY,
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 14,
      clusterProperties: {
        down: [
          "+",
          [
            "case",
            ["in", ["get", "status"], ["literal", ["malfunction", "maintenance", "stolen"]]],
            1,
            0,
          ],
        ],
      },
    });
    map.addSource("agents", { type: "geojson", data: EMPTY });
    map.addSource("selection", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "neighborhood-fill",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": [
          "match",
          ["coalesce", ["feature-state", "level"], "normal"],
          "critical",
          HEALTH_COLORS.critical,
          "attention",
          HEALTH_COLORS.attention,
          "#8a94a6",
        ],
        "fill-opacity": [
          "match",
          ["coalesce", ["feature-state", "level"], "normal"],
          "critical",
          0.28,
          "attention",
          0.16,
          0.03,
        ],
      },
    });
    map.addLayer({
      id: "neighborhood-line",
      type: "line",
      source: "neighborhoods",
      paint: {
        "line-color": [
          "match",
          ["coalesce", ["feature-state", "level"], "normal"],
          "critical",
          HEALTH_COLORS.critical,
          "attention",
          HEALTH_COLORS.attention,
          "#4b545e",
        ],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1],
      },
    });
    map.addLayer({
      id: "heat",
      type: "heatmap",
      source: "heat",
      paint: {
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 14, 15, 34],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 15, 1.2],
        "heatmap-opacity": 0.75,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0,0,0,0)",
          0.2,
          "#184f95",
          0.45,
          "#3987e5",
          0.7,
          "#fab219",
          1,
          "#d03b3b",
        ],
      },
    });
    map.addLayer({
      id: "equipment-clusters",
      type: "circle",
      source: "equipment",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ["case", [">", ["get", "down"], 0], "#3a2a2c", "#26332a"],
        "circle-stroke-color": ["case", [">", ["get", "down"], 0], "#d03b3b", "#0ca30c"],
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 30, 24],
      },
    });
    if (online) {
      map.addLayer({
        id: "equipment-cluster-count",
        type: "symbol",
        source: "equipment",
        filter: ["has", "point_count"],
        layout: {
          "text-field": [
            "case",
            [">", ["get", "down"], 0],
            [
              "concat",
              ["to-string", ["get", "point_count"]],
              "\n",
              ["to-string", ["get", "down"]],
              " ⚠",
            ],
            ["to-string", ["get", "point_count"]],
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-line-height": 1.1,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#eef0f2" },
      });
    }
    map.addLayer({
      id: "equipment-points",
      type: "symbol",
      source: "equipment",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["concat", "equipment-", ["get", "type"], "-", ["get", "status"]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["case", ["==", ["get", "status"], "operational"], 1, 2],
      },
    });
    map.addLayer({
      id: "agents",
      type: "symbol",
      source: "agents",
      layout: {
        "icon-image": ["concat", "agent-", ["get", "status"]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    map.addLayer({
      id: "selection",
      type: "circle",
      source: "selection",
      paint: {
        "circle-radius": 21,
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#ffc20e",
        "circle-stroke-width": 3,
      },
    });

    const select = (kind: "equipment" | "agent") => (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties["id"];
      if (typeof id === "number") {
        onSelect({ kind, id });
      }
    };
    map.on("click", "equipment-points", select("equipment"));
    map.on("click", "agents", select("agent"));
    map.on("click", "equipment-clusters", async (event) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties["cluster_id"];
      if (!feature || typeof clusterId !== "number" || feature.geometry.type !== "Point") {
        return;
      }
      const zoom = await map
        .getSource<GeoJSONSource>("equipment")!
        .getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    });
    map.on("click", "neighborhood-fill", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ["equipment-points", "agents", "equipment-clusters"],
      });
      const id = event.features?.[0]?.properties["id"];
      if (hits.length === 0 && typeof id === "string") {
        onSelect({ kind: "neighborhood", id });
      }
    });
    for (const layer of ["equipment-points", "agents", "equipment-clusters", "neighborhood-fill"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }
  }, [handle, props.meta.neighborhoods]);

  useEffect(() => {
    const source = handle?.map.getSource<GeoJSONSource>("equipment");
    void source?.setData({
      type: "FeatureCollection",
      features: props.layers.equipment
        ? props.equipment.map((item) =>
            point(...equipmentPosition(item), {
              id: item.id,
              type: item.type,
              status: item.status,
            }),
          )
        : [],
    });
  }, [handle, props.equipment, props.layers.equipment]);

  useEffect(() => {
    const source = handle?.map.getSource<GeoJSONSource>("agents");
    void source?.setData({
      type: "FeatureCollection",
      features: props.layers.agents
        ? props.agents
            .filter((agent) => agent.status !== "off_duty")
            .map((agent) => point(agent.lng, agent.lat, { id: agent.id, status: agent.status }))
        : [],
    });
  }, [handle, props.agents, props.layers.agents]);

  useEffect(() => {
    const source = handle?.map.getSource<GeoJSONSource>("heat");
    void source?.setData({
      type: "FeatureCollection",
      features: props.layers.heat ? props.heatPoints.map(([lng, lat]) => point(lng, lat, {})) : [],
    });
  }, [handle, props.heatPoints, props.layers.heat]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    for (const area of props.neighborhoodHealth) {
      map.setFeatureState(
        { source: "neighborhoods", id: area.id },
        { level: props.layers.health ? area.level : "normal" },
      );
    }
  }, [handle, props.neighborhoodHealth, props.layers.health]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    const selected = props.selected;
    for (const neighborhood of props.meta.neighborhoods) {
      map.setFeatureState(
        { source: "neighborhoods", id: neighborhood.id },
        { selected: selected?.kind === "neighborhood" && selected.id === neighborhood.id },
      );
    }
    let position: [number, number] | null = null;
    if (selected?.kind === "equipment") {
      const item = props.equipment.find((entry) => entry.id === selected.id);
      position = item ? equipmentPosition(item) : null;
    } else if (selected?.kind === "agent") {
      const agent = props.agents.find((entry) => entry.id === selected.id);
      position = agent ? [agent.lng, agent.lat] : null;
    }
    void map
      .getSource<GeoJSONSource>("selection")
      ?.setData({ type: "FeatureCollection", features: position ? [point(...position, {})] : [] });
  }, [handle, props.selected, props.equipment, props.agents, props.meta.neighborhoods]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const current = markers.current;
    const visible = props.layers.occurrences ? props.occurrences : [];
    const ids = new Set(visible.map((item) => item.id));
    for (const [id, marker] of current) {
      if (!ids.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }
    for (const occurrence of visible) {
      const label = `${OCCURRENCE_KINDS[occurrence.kind].label}, gravidade ${SEVERITY_LABELS[occurrence.severity].toLowerCase()}`;
      const existing = current.get(occurrence.id);
      if (existing) {
        const element = existing.getElement();
        element.style.background = SEVERITY_COLORS[occurrence.severity];
        element.setAttribute("aria-label", label);
        continue;
      }
      const element = document.createElement("button");
      element.type = "button";
      element.className = "occurrence-marker";
      element.style.background = SEVERITY_COLORS[occurrence.severity];
      element.style.color = SEVERITY_COLORS[occurrence.severity];
      element.setAttribute("aria-label", label);
      element.title = label;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect({ kind: "occurrence", id: occurrence.id });
      });
      current.set(
        occurrence.id,
        new Marker({ element }).setLngLat([occurrence.lng, occurrence.lat]).addTo(handle.map),
      );
    }
  }, [handle, props.occurrences, props.layers.occurrences]);

  useEffect(() => {
    if (handle && props.focus) {
      handle.map.flyTo({
        center: [props.focus.lng, props.focus.lat],
        zoom: Math.max(handle.map.getZoom(), 15),
        speed: 1.4,
      });
    }
  }, [handle, props.focus]);

  return (
    <>
      <div ref={container} className="map" role="region" aria-label="Mapa operacional de Marília" />
      {handle && !handle.online && (
        <p className="map-overlay map-offline">
          Sem acesso ao mapa de ruas. Os bairros e marcadores continuam funcionando com os dados
          locais.
        </p>
      )}
    </>
  );
}
