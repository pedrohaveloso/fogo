import { useCallback, useMemo, useRef, useState } from "react";
import type { Alert } from "../../shared/types.ts";
import { AlertFeed } from "../components/AlertFeed.tsx";
import { DetailDrawer } from "../components/DetailDrawer.tsx";
import { CityStatus } from "../components/CityStatus.tsx";
import { EquipmentFilterBar } from "../components/EquipmentFilterBar.tsx";
import {
  EMPTY_FILTERS,
  matchesFilters,
  type EquipmentFilters,
} from "../components/OperationsFilters.tsx";
import { RegionHealthList } from "../components/RegionHealthList.tsx";
import { TabList, tabId, tabPanelId } from "../components/Tabs.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { useLive, useMeta } from "../live.ts";
import { LayerPanel } from "../map/LayerPanel.tsx";
import { OperationsMap, type MapLayers, type Selection } from "../map/OperationsMap.tsx";
import { useFetch } from "../useFetch.ts";
import { useNow } from "../useNow.ts";

const STACKED_LAYOUT = "(max-width: 1024px)";

export function OperationsPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(10_000);
  const [filters, setFilters] = useState<EquipmentFilters>(EMPTY_FILTERS);
  const mapBox = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<MapLayers>({
    health: true,
    equipment: true,
    agents: true,
    occurrences: true,
    heat: false,
  });
  const [tab, setTab] = useState<"alerts" | "regions">("alerts");
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
    return <LoadingNotice label="Conectando à central de operações..." />;
  }

  const agents = regionNeighborhoods
    ? snapshot.agents.filter((agent) => regionNeighborhoods.has(agent.baseNeighborhoodId))
    : snapshot.agents;
  const occurrences = regionNeighborhoods
    ? snapshot.occurrences.filter((item) => regionNeighborhoods.has(item.neighborhoodId))
    : snapshot.occurrences;
  const waiting = snapshot.occurrences.filter((item) => item.status === "open").length;
  const pendingAlerts = snapshot.alerts.filter((alert) => !alert.acknowledged).length;
  const flaggedRegions = snapshot.regions.filter((region) => region.level !== "normal").length;
  const tabs = [
    { key: "alerts", label: "Alertas", count: pendingAlerts },
    { key: "regions", label: "Regiões", count: flaggedRegions },
  ] as const;

  return (
    <main className="ops">
      <h1 className="visually-hidden">Central de operações</h1>
      <div className="ops-map" ref={mapBox}>
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
          now={now}
          onSelect={setSelected}
        />
        <EquipmentFilterBar
          idPrefix="map"
          label="Filtrar equipamentos no mapa"
          className="map-overlay"
          meta={meta}
          filters={filters}
          onChange={setFilters}
          matching={equipment.length}
          total={snapshot.equipment.length}
        />
        <LayerPanel layers={layers} onChange={setLayers} />
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
      <aside className="ops-panel" aria-label="Situação da cidade">
        <CityStatus
          city={snapshot.city}
          kpis={snapshot.kpis}
          waiting={waiting}
          filters={filters}
          onFiltersChange={(next) => {
            setFilters(next);
            if (window.matchMedia(STACKED_LAYOUT).matches) {
              mapBox.current?.scrollIntoView({ block: "start" });
            }
          }}
        />
        <TabList
          items={tabs.map((item) => ({
            key: item.key,
            label: (
              <>
                {item.label}
                <span className="ops-tab-count">{item.count}</span>
              </>
            ),
          }))}
          selected={tab}
          onSelect={setTab}
          label="Painel"
          idPrefix="ops"
          className="ops-tabs"
        />
        <div
          id={tabPanelId("ops")}
          className="ops-tab-panel"
          role="tabpanel"
          aria-labelledby={tabId("ops", tab)}
        >
          {tab === "alerts" ? (
            <AlertFeed
              alerts={snapshot.alerts}
              now={now}
              generatedAt={snapshot.generatedAt}
              onLocate={locate}
            />
          ) : (
            <RegionHealthList
              regions={snapshot.regions}
              neighborhoods={snapshot.neighborhoods}
              selectedRegion={filters.regionId}
              onSelectRegion={(regionId) =>
                setFilters({ ...filters, regionId, neighborhoodId: "" })
              }
              onSelectNeighborhood={focusNeighborhood}
            />
          )}
        </div>
      </aside>
    </main>
  );
}
