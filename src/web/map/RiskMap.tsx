import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import type { Meta, NeighborhoodRisk, RiskLevel } from "../../shared/types.ts";
import { RISK_COLORS } from "../colors.ts";
import { CRITICAL_HATCH, NEIGHBORHOOD_ATTRIBUTION, useMap } from "./base.ts";
import { idFilter, neighborhoodFeatures } from "./geojson.ts";

type Props = {
  meta: Meta;
  risks: NeighborhoodRisk[];
  selected: string | null;
  onSelect: (id: string) => void;
};

export function RiskMap({ meta, risks, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useMap(container, { center: meta.city.center, zoom: 11.8 });
  const select = useEffectEvent((id: string) => onSelect(id));

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { map } = handle;
    map.addSource("risk", {
      type: "geojson",
      data: neighborhoodFeatures(meta.neighborhoods),
      promoteId: "id",
      attribution: NEIGHBORHOOD_ATTRIBUTION,
    });
    map.addLayer({
      id: "risk-fill",
      type: "fill",
      source: "risk",
      paint: {
        "fill-color": RISK_COLORS.well_above,
        "fill-opacity": [
          "match",
          ["coalesce", ["feature-state", "level"], "normal"],
          "well_above",
          0.16,
          0,
        ],
      },
    });
    map.addLayer({
      id: "risk-hatch",
      type: "fill",
      source: "risk",
      filter: idFilter([]),
      paint: { "fill-pattern": CRITICAL_HATCH, "fill-opacity": 0.7 },
    });
    map.addLayer({
      id: "risk-above",
      type: "line",
      source: "risk",
      filter: idFilter([]),
      paint: {
        "line-color": RISK_COLORS.above,
        "line-width": 1.6,
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "risk-line",
      type: "line",
      source: "risk",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#ffffff",
          "rgba(255, 255, 255, 0.16)",
        ],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1],
      },
    });
    map.on("click", "risk-fill", (event) => {
      const id = event.features?.[0]?.properties["id"];
      if (typeof id === "string") {
        select(id);
      }
    });
    map.on("mouseenter", "risk-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "risk-fill", () => {
      map.getCanvas().style.cursor = "";
    });
  }, [handle, meta.neighborhoods]);

  useEffect(() => {
    if (!handle || !handle.map.getSource<GeoJSONSource>("risk")) {
      return;
    }
    for (const risk of risks) {
      handle.map.setFeatureState(
        { source: "risk", id: risk.neighborhoodId },
        { level: risk.level, selected: risk.neighborhoodId === selected },
      );
    }
    const ids = (level: RiskLevel) =>
      risks.filter((risk) => risk.level === level).map((risk) => risk.neighborhoodId);
    handle.map.setFilter("risk-hatch", idFilter(ids("well_above")));
    handle.map.setFilter("risk-above", idFilter(ids("above")));
  }, [handle, risks, selected]);

  return (
    <div className="risk-map">
      <div
        ref={container}
        className="map"
        role="region"
        aria-label="Mapa de risco por bairro. A mesma informação está na lista ao lado."
      />
    </div>
  );
}
