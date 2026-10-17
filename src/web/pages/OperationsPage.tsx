import { useCallback, useMemo, useState } from "react";
import { EQUIPMENT_STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../shared/catalog.ts";
import type { Alert } from "../../shared/types.ts";
import { AGENT_STATUS_COLORS, SEVERITY_COLORS } from "../colors.ts";
import { AlertFeed } from "../components/AlertFeed.tsx";
import { DetailDrawer } from "../components/DetailDrawer.tsx";
import { KpiStrip } from "../components/KpiStrip.tsx";
import {
  EMPTY_FILTERS,
  OperationsFilters,
  matchesFilters,
  type EquipmentFilters,
} from "../components/OperationsFilters.tsx";
import { RegionHealthList } from "../components/RegionHealthList.tsx";
import { StatusShape, shapePath } from "../icons.tsx";
import { useLive, useMeta } from "../live.ts";
import { OperationsMap, type MapLayers, type Selection } from "../map/OperationsMap.tsx";
import { useFetch } from "../useFetch.ts";
import { useNow } from "../useNow.ts";

const LAYER_LABELS: Record<keyof MapLayers, string> = {
  health: "Situação dos bairros",
  equipment: "Equipamentos",
  agents: "Agentes em serviço",
  occurrences: "Ocorrências abertas",
  heat: "Mapa de calor (30 dias)",
};

export function OperationsPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(10_000);
  const [filters, setFilters] = useState<EquipmentFilters>(EMPTY_FILTERS);
  const [layers, setLayers] = useState<MapLayers>({
    health: true,
    equipment: true,
    agents: true,
    occurrences: true,
    heat: false,
  });
  const [selected, setSelected] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<{ lng: number; lat: number; key: number } | null>(null);
  const heat = useFetch<[number, number][]>(layers.heat ? "/occurrences/heat?days=30" : null);

  const equipment = useMemo(
    () =>
      snapshot && meta
        ? snapshot.equipment.filter((item) => matchesFilters(item, filters, meta, now))
        : [],
    [snapshot, meta, filters, now],
  );

  const regionNeighborhoods = useMemo(() => {
    if (!meta || (!filters.regionId && !filters.neighborhoodId)) {
      return null;
    }
    return new Set(
      meta.neighborhoods
        .filter((item) =>
          filters.neighborhoodId
            ? item.id === filters.neighborhoodId
            : item.regionId === filters.regionId,
        )
        .map((item) => item.id),
    );
  }, [meta, filters.regionId, filters.neighborhoodId]);

  const closeDrawer = useCallback(() => setSelected(null), []);

  const locate = useCallback((alert: Alert) => {
    if (alert.lat === null || alert.lng === null) {
      return;
    }
    setFocus({ lat: alert.lat, lng: alert.lng, key: Date.now() });
    if (
      alert.target?.kind === "equipment" ||
      alert.target?.kind === "agent" ||
      alert.target?.kind === "occurrence"
    ) {
      setSelected({ kind: alert.target.kind, id: Number(alert.target.id) });
    } else if (alert.target?.kind === "neighborhood") {
      setSelected({ kind: "neighborhood", id: alert.target.id });
    }
  }, []);

  const focusNeighborhood = useCallback(
    (id: string) => {
      const neighborhood = meta?.neighborhoods.find((item) => item.id === id);
      if (neighborhood) {
        setFocus({ lat: neighborhood.lat, lng: neighborhood.lng, key: Date.now() });
        setSelected({ kind: "neighborhood", id });
      }
    },
    [meta],
  );

  if (!meta || !snapshot) {
    return (
      <main className="page">
        <p className="hint" role="status">
          Conectando à central de operações...
        </p>
      </main>
    );
  }

  const agents = regionNeighborhoods
    ? snapshot.agents.filter((agent) => regionNeighborhoods.has(agent.baseNeighborhoodId))
    : snapshot.agents;
  const occurrences = regionNeighborhoods
    ? snapshot.occurrences.filter((item) => regionNeighborhoods.has(item.neighborhoodId))
    : snapshot.occurrences;

  return (
    <main className="ops">
      <h1 className="visually-hidden">Central de operações</h1>
      <KpiStrip kpis={snapshot.kpis} />
      <div className="ops-side ops-side-left">
        <OperationsFilters
          meta={meta}
          filters={filters}
          onChange={setFilters}
          matching={equipment.length}
          total={snapshot.equipment.length}
        />
        <RegionHealthList
          regions={snapshot.regions}
          neighborhoods={snapshot.neighborhoods}
          selectedRegion={filters.regionId}
          onSelectRegion={(regionId) => setFilters({ ...filters, regionId, neighborhoodId: "" })}
          onSelectNeighborhood={focusNeighborhood}
        />
      </div>
      <div className="ops-map">
        <OperationsMap
          meta={meta}
          equipment={equipment}
          agents={agents}
          occurrences={occurrences}
          neighborhoodHealth={snapshot.neighborhoods}
          heatPoints={heat.data ?? []}
          layers={layers}
          selected={selected}
          focus={focus}
          onSelect={setSelected}
        />
        <fieldset className="map-overlay map-layers">
          <legend className="visually-hidden">Camadas do mapa</legend>
          {(Object.keys(LAYER_LABELS) as (keyof MapLayers)[]).map((key) => (
            <label key={key} className="check" style={{ minHeight: 28 }}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(event) => setLayers({ ...layers, [key]: event.target.checked })}
              />
              {LAYER_LABELS[key]}
            </label>
          ))}
        </fieldset>
        <div className="map-overlay map-legend" aria-label="Legenda do mapa">
          {EQUIPMENT_STATUSES.map((status) => (
            <span key={status} className="legend-item">
              <StatusShape status={status} color={STATUS_COLORS[status]} size={14} />
              {STATUS_LABELS[status]}
            </span>
          ))}
          <span className="legend-item">
            <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true">
              <path d={shapePath("shield", 14)} fill={AGENT_STATUS_COLORS.available} />
            </svg>
            Agente disponível
          </span>
          <span className="legend-item">
            <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true">
              <path d={shapePath("shield", 14)} fill={AGENT_STATUS_COLORS.responding} />
            </svg>
            Agente em atendimento
          </span>
          <span className="legend-item">
            <span
              className="level-dot"
              style={{ background: SEVERITY_COLORS[4], borderRadius: "50%" }}
            />
            Ocorrência (cor = gravidade)
          </span>
        </div>
        {selected && (
          <DetailDrawer
            key={`${selected.kind}-${selected.id}`}
            selection={selected}
            snapshot={snapshot}
            meta={meta}
            now={now}
            onClose={closeDrawer}
            onFilterNeighborhood={(id) => {
              const neighborhood = meta.neighborhoods.find((item) => item.id === id);
              setFilters({
                ...filters,
                neighborhoodId: id,
                regionId: neighborhood?.regionId ?? "",
              });
            }}
          />
        )}
      </div>
      <div className="ops-side ops-side-right">
        <AlertFeed alerts={snapshot.alerts} now={now} onLocate={locate} />
      </div>
    </main>
  );
}
