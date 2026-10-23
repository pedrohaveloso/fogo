import { useMemo } from "react";
import { AGENCY_SHORT_LABELS, EQUIPMENT_TYPES, STATUS_LABELS } from "../../shared/catalog.ts";
import {
  MAINTENANCE_SOON_DAYS,
  maintenanceDaysLeft,
  maintenanceState,
} from "../../shared/maintenance.ts";
import { silentMinutes } from "../../shared/telemetry.ts";
import type { Equipment } from "../../shared/types.ts";
import { StatusBadge } from "../components/badges.tsx";
import { EquipmentFilterBar } from "../components/EquipmentFilterBar.tsx";
import {
  matchesFilters,
  showsDownOfType,
  toggleDownOfType,
  type EquipmentFilters,
} from "../components/OperationsFilters.tsx";
import { formatDate, formatInteger, formatMaintenanceDue, formatRelative } from "../format.ts";
import { Glyph, TYPE_GLYPHS } from "../icons.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { useLive, useMeta } from "../live.ts";
import { equipmentFromQuery, equipmentQuery, type Sort, type SortKey } from "../listQuery.ts";
import { Link, navigate, useLocation } from "../router.tsx";
import { fleetSummary } from "../summaries.ts";
import { useNow } from "../useNow.ts";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "serial", label: "Equipamento" },
  { key: "status", label: "Situação" },
  { key: "neighborhood", label: "Local" },
  { key: "maintenance", label: "Próxima manutenção" },
  { key: "seen", label: "Última comunicação" },
];

function dueClass(days: number): string {
  if (days < 0) {
    return "cell-alert";
  }
  return days <= MAINTENANCE_SOON_DAYS ? "cell-warning" : "cell-sub";
}

function show(filters: EquipmentFilters, sort: Sort): void {
  navigate(`/equipamentos${equipmentQuery(filters, sort)}`, { replace: true });
}

export function EquipmentListPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(30_000);
  const { params } = useLocation();
  const query = params.toString();
  const { filters, sort } = useMemo(() => equipmentFromQuery(new URLSearchParams(query)), [query]);
  const setFilters = (next: EquipmentFilters) => show(next, sort);

  const names = useMemo(
    () => new Map(meta?.neighborhoods.map((item) => [item.id, item.name]) ?? []),
    [meta],
  );

  const fleet = useMemo(() => fleetSummary(snapshot?.equipment ?? []), [snapshot]);

  const rows = useMemo(() => {
    if (!snapshot || !meta) {
      return [];
    }
    const value = (item: Equipment): string | number => {
      switch (sort.key) {
        case "serial":
          return item.serialNumber;
        case "status":
          return STATUS_LABELS[item.status];
        case "neighborhood":
          return names.get(item.neighborhoodId) ?? "";
        case "maintenance":
          return item.nextMaintenanceAt ?? "9999";
        case "seen":
          return item.lastSeenAt ? -Date.parse(item.lastSeenAt) : 0;
      }
    };
    return snapshot.equipment
      .filter((item) => matchesFilters(item, filters, meta, now))
      .sort((a, b) => {
        const left = value(a);
        const right = value(b);
        const order =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "pt-BR");
        return order * sort.direction;
      });
  }, [snapshot, meta, filters, now, sort, names]);

  if (!meta || !snapshot) {
    return <LoadingNotice label="Carregando inventário..." />;
  }

  const down = fleet.reduce((sum, entry) => sum + entry.down, 0);
  const downTypes = fleet.filter((entry) => entry.down > 0);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Equipamentos</h1>
          <p>
            Inventário dos equipamentos de trânsito e segurança instalados ou previstos para
            Marília. {formatInteger(snapshot.equipment.length)} cadastrados, {formatInteger(down)}{" "}
            fora de operação agora.
          </p>
        </div>
        <Link href="/equipamentos/novo" className="button button-primary">
          Cadastrar equipamento
        </Link>
      </div>
      <div className="inventory-stack">
        {downTypes.length > 0 && (
          <p className="quick-filters">
            <span id="quick-filters-label">Parados por tipo:</span>
            {downTypes.map((entry) => (
              <button
                key={entry.type}
                type="button"
                aria-pressed={showsDownOfType(filters, entry.type)}
                aria-describedby="quick-filters-label"
                onClick={() => setFilters(toggleDownOfType(filters, entry.type))}
              >
                <Glyph d={TYPE_GLYPHS[entry.type]} size={16} />
                {EQUIPMENT_TYPES[entry.type].plural}
                <strong data-tone="critical">{entry.down}</strong>
              </button>
            ))}
          </p>
        )}
        <EquipmentFilterBar
          idPrefix="list"
          label="Filtrar equipamentos"
          className="page-filter-bar"
          meta={meta}
          filters={filters}
          onChange={setFilters}
          matching={rows.length}
          total={snapshot.equipment.length}
          alwaysShowCount
        />
        <div className="table-wrap inventory-table" data-sticky="page">
          <table>
            <caption className="visually-hidden">
              Lista de equipamentos, ordenável pelas colunas
            </caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sort.key === column.key
                        ? sort.direction === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className="sort-button"
                      onClick={() =>
                        show(filters, {
                          key: column.key,
                          direction: sort.key === column.key ? (sort.direction === 1 ? -1 : 1) : 1,
                        })
                      }
                    >
                      {column.label}
                      <span className="sort-arrow" aria-hidden="true">
                        {sort.key === column.key ? (sort.direction === 1 ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </th>
                ))}
                <th scope="col">Órgão</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="empty">
                    Nenhum equipamento corresponde aos filtros. Ajuste ou limpe os filtros para ver
                    o inventário.
                  </td>
                </tr>
              )}
              {rows.map((item) => {
                const days = maintenanceDaysLeft(item, now);
                const address = `${item.street}, ${item.reference}`;
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/equipamentos/${item.id}`} className="row-button">
                        <Glyph d={TYPE_GLYPHS[item.type]} size={18} />
                        {item.serialNumber}
                      </Link>
                      <span className="cell-sub">{EQUIPMENT_TYPES[item.type].label}</span>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {names.get(item.neighborhoodId)}
                      <span className="cell-sub cell-clip" title={address}>
                        {address}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatDate(item.nextMaintenanceAt)}
                      {days !== null && (
                        <span className={dueClass(days)}>{formatMaintenanceDue(days)}</span>
                      )}
                      {item.maintenanceNeed === "immediate" &&
                        maintenanceState(item, now) === "urgent" && (
                          <span className="cell-alert">manutenção imediata</span>
                        )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatRelative(item.lastSeenAt, now)}
                      {silentMinutes(item, now) !== null && (
                        <span className="cell-warning">sem comunicação</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{AGENCY_SHORT_LABELS[item.agency]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
