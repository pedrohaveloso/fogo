import {
  Marker,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import { OCCURRENCE_KINDS, SEVERITY_LABELS } from "../../shared/catalog.ts";
import { maintenanceState } from "../../shared/maintenance.ts";
import type { Agent, AreaHealth, Equipment, Meta, Occurrence } from "../../shared/types.ts";
import { AGENT_STATUS_COLORS, HEALTH_COLORS, SEVERITY_COLORS } from "../colors.ts";
import { CRITICAL_HATCH, NEIGHBORHOOD_ATTRIBUTION, useMap } from "./base.ts";
import { dispatchLines, idFilter, idsAtLevel, neighborhoodFeatures } from "./geojson.ts";

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
  now: number;
  onSelect: (selection: Selection | null) => void;
};

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const MAP_GROUND = "#111417";
const CLUSTER_BADGE_OFFSET: [number, number] = [13, -13];
const CLICKABLE_LAYERS = ["equipment-points", "agents", "equipment-clusters", "cluster-badge"];
const LEVEL: ExpressionSpecification = ["coalesce", ["feature-state", "level"], "normal"];

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

function occurrenceLabel(occurrence: Occurrence): string {
  const kind = OCCURRENCE_KINDS[occurrence.kind].label;
  const severity = SEVERITY_LABELS[occurrence.severity].toLowerCase();
  const state = occurrence.status === "responding" ? "equipe a caminho" : "aguardando equipe";
  return `${kind}, gravidade ${severity}, ${state}`;
}

function paintOccurrence(element: HTMLElement, occurrence: Occurrence): void {
  const color = SEVERITY_COLORS[occurrence.severity];
  const label = occurrenceLabel(occurrence);
  element.style.background = color;
  element.style.color = color;
  element.dataset["waiting"] = String(occurrence.status === "open");
  element.setAttribute("aria-label", label);
  element.title = label;
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
      attribution: NEIGHBORHOOD_ATTRIBUTION,
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
    map.addSource("dispatch", { type: "geojson", data: EMPTY });
    map.addSource("agents", { type: "geojson", data: EMPTY });
    map.addSource("selection", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "neighborhood-fill",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": [
          "match",
          LEVEL,
          "critical",
          HEALTH_COLORS.critical,
          "attention",
          HEALTH_COLORS.attention,
          MAP_GROUND,
        ],
        "fill-opacity": ["match", LEVEL, "critical", 0.14, 0],
      },
    });
    map.addLayer({
      id: "neighborhood-hatch",
      type: "fill",
      source: "neighborhoods",
      filter: idFilter([]),
      paint: { "fill-pattern": CRITICAL_HATCH, "fill-opacity": 0.6 },
    });
    map.addLayer({
      id: "neighborhood-line",
      type: "line",
      source: "neighborhoods",
      paint: {
        "line-color": [
          "match",
          LEVEL,
          "critical",
          HEALTH_COLORS.critical,
          "rgba(255, 255, 255, 0.13)",
        ],
        "line-width": ["match", LEVEL, "critical", 1.6, 0.8],
      },
    });
    map.addLayer({
      id: "neighborhood-attention",
      type: "line",
      source: "neighborhoods",
      filter: idFilter([]),
      layout: { "line-cap": "butt" },
      paint: {
        "line-color": HEALTH_COLORS.attention,
        "line-width": 1.4,
        "line-opacity": 0.8,
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "neighborhood-selected",
      type: "line",
      source: "neighborhoods",
      filter: idFilter([]),
      paint: { "line-color": "#ffffff", "line-width": 2.5 },
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
      id: "dispatch",
      type: "line",
      source: "dispatch",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": AGENT_STATUS_COLORS.responding,
        "line-width": 2.5,
        "line-dasharray": [0.1, 2],
        "line-opacity": 0.7,
      },
    });
    map.addLayer({
      id: "equipment-clusters",
      type: "circle",
      source: "equipment",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#1f2328",
        "circle-stroke-color": [
          "case",
          [">", ["get", "down"], 0],
          HEALTH_COLORS.critical,
          HEALTH_COLORS.normal,
        ],
        "circle-stroke-width": 2,
        "circle-radius": ["step", ["get", "point_count"], 15, 10, 17, 30, 19],
      },
    });
    map.addLayer({
      id: "cluster-badge",
      type: "circle",
      source: "equipment",
      filter: ["all", ["has", "point_count"], [">", ["get", "down"], 0]],
      paint: {
        "circle-color": HEALTH_COLORS.critical,
        "circle-radius": 8,
        "circle-stroke-color": MAP_GROUND,
        "circle-stroke-width": 2,
        "circle-translate": CLUSTER_BADGE_OFFSET,
      },
    });
    if (online) {
      map.addLayer({
        id: "equipment-cluster-count",
        type: "symbol",
        source: "equipment",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["to-string", ["get", "point_count"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#eef0f2" },
      });
      map.addLayer({
        id: "cluster-badge-count",
        type: "symbol",
        source: "equipment",
        filter: ["all", ["has", "point_count"], [">", ["get", "down"], 0]],
        layout: {
          "text-field": ["to-string", ["get", "down"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 10,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff", "text-translate": CLUSTER_BADGE_OFFSET },
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
      id: "equipment-maintenance",
      type: "symbol",
      source: "equipment",
      filter: ["all", ["!", ["has", "point_count"]], ["has", "maintenance"]],
      layout: {
        "icon-image": ["concat", "maintenance-", ["get", "maintenance"]],
        "icon-offset": [11, 11],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    map.addLayer({
      id: "agents",
      type: "symbol",
      source: "agents",
      layout: {
        "icon-image": ["concat", "agent-", ["get", "role"], "-", ["get", "status"]],
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
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });

    const select = (kind: "equipment" | "agent") => (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties["id"];
      if (typeof id === "number") {
        onSelect({ kind, id });
      }
    };
    const expandCluster = async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId = feature?.properties["cluster_id"];
      if (!feature || typeof clusterId !== "number" || feature.geometry.type !== "Point") {
        return;
      }
      const zoom = await map
        .getSource<GeoJSONSource>("equipment")!
        .getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
    };
    map.on("click", "equipment-points", select("equipment"));
    map.on("click", "agents", select("agent"));
    map.on("click", "equipment-clusters", (event) => void expandCluster(event));
    map.on("click", "cluster-badge", (event) => void expandCluster(event));
    map.on("click", "neighborhood-fill", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      const hits = map.queryRenderedFeatures(event.point, { layers: CLICKABLE_LAYERS });
      const id = event.features?.[0]?.properties["id"];
      if (hits.length === 0 && typeof id === "string") {
        onSelect({ kind: "neighborhood", id });
      }
    });
    for (const layer of [...CLICKABLE_LAYERS, "neighborhood-fill"]) {
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
        ? props.equipment.map((item) => {
            const maintenance = maintenanceState(item, props.now);
            return point(...equipmentPosition(item), {
              id: item.id,
              type: item.type,
              status: item.status,
              ...(maintenance && { maintenance }),
            });
          })
        : [],
    });
  }, [handle, props.equipment, props.layers.equipment, props.now]);

  useEffect(() => {
    const source = handle?.map.getSource<GeoJSONSource>("agents");
    void source?.setData({
      type: "FeatureCollection",
      features: props.layers.agents
        ? props.agents
            .filter((agent) => agent.status !== "off_duty")
            .map((agent) =>
              point(agent.lng, agent.lat, { id: agent.id, role: agent.role, status: agent.status }),
            )
        : [],
    });
  }, [handle, props.agents, props.layers.agents]);

  useEffect(() => {
    const source = handle?.map.getSource<GeoJSONSource>("dispatch");
    void source?.setData(
      props.layers.agents && props.layers.occurrences
        ? dispatchLines(props.agents, props.occurrences)
        : EMPTY,
    );
  }, [handle, props.agents, props.occurrences, props.layers.agents, props.layers.occurrences]);

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
    const visible = props.layers.health;
    for (const area of props.neighborhoodHealth) {
      map.setFeatureState(
        { source: "neighborhoods", id: area.id },
        { level: visible ? area.level : "normal" },
      );
    }
    map.setFilter(
      "neighborhood-hatch",
      idFilter(visible ? idsAtLevel(props.neighborhoodHealth, "critical") : []),
    );
    map.setFilter(
      "neighborhood-attention",
      idFilter(visible ? idsAtLevel(props.neighborhoodHealth, "attention") : []),
    );
  }, [handle, props.neighborhoodHealth, props.layers.health]);

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    const selected = props.selected;
    map.setFilter(
      "neighborhood-selected",
      idFilter(selected?.kind === "neighborhood" ? [selected.id] : []),
    );
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
  }, [handle, props.selected, props.equipment, props.agents]);

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
      const existing = current.get(occurrence.id);
      if (existing) {
        paintOccurrence(existing.getElement(), occurrence);
        continue;
      }
      const element = document.createElement("button");
      element.type = "button";
      element.className = "occurrence-marker";
      paintOccurrence(element, occurrence);
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
