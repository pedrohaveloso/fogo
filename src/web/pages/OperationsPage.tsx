import { useCallback, useMemo, useState } from "react";
import type { Alert } from "../../shared/types.ts";
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
import { useLive, useMeta } from "../live.ts";
import { LayerPanel } from "../map/LayerPanel.tsx";
import { OperationsMap, type MapLayers, type Selection } from "../map/OperationsMap.tsx";
import { useFetch } from "../useFetch.ts";
import { useNow } from "../useNow.ts";

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
  const waiting = snapshot.occurrences.filter((item) => item.status === "open").length;
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <main className="ops">
      <h1 className="visually-hidden">Central de operações</h1>
      <KpiStrip kpis={snapshot.kpis} waiting={waiting} />
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
        <LayerPanel layers={layers} onChange={setLayers} />
        {filtered && (
          <div className="map-overlay map-filter-note" role="status">
            <span>
              Filtro ativo: {equipment.length} de {snapshot.equipment.length} equipamentos no mapa
            </span>
            <button
              type="button"
              className="button button-small"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Limpar filtros
            </button>
          </div>
        )}
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
        <AlertFeed
          alerts={snapshot.alerts}
          now={now}
          generatedAt={snapshot.generatedAt}
          onLocate={locate}
        />
      </div>
    </main>
  );
}
