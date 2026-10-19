import { useMemo, useState } from "react";
import {
  AGENCY_SHORT_LABELS,
  EQUIPMENT_TYPES,
  STATUS_COLORS,
  STATUS_LABELS,
} from "../../shared/catalog.ts";
import { daysBetween, localDate } from "../../shared/time.ts";
import type { Equipment } from "../../shared/types.ts";
import { StatusBadge } from "../components/badges.tsx";
import {
  EMPTY_FILTERS,
  OperationsFilters,
  matchesFilters,
  type EquipmentFilters,
} from "../components/OperationsFilters.tsx";
import { formatDate, formatInteger, formatRelative } from "../format.ts";
import { Glyph, StatusShape, TYPE_GLYPHS } from "../icons.tsx";
import { useLive, useMeta } from "../live.ts";
import { Link, navigate } from "../router.tsx";
import { fleetSummary } from "../summaries.ts";
import { useNow } from "../useNow.ts";

type SortKey = "serial" | "status" | "neighborhood" | "maintenance" | "seen";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "serial", label: "Equipamento" },
  { key: "status", label: "Situação" },
  { key: "neighborhood", label: "Local" },
  { key: "maintenance", label: "Próxima manutenção" },
  { key: "seen", label: "Última comunicação" },
];

export function EquipmentListPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(30_000);
  const [filters, setFilters] = useState<EquipmentFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: "serial",
    direction: 1,
  });

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
    return (
      <main className="page">
        <p className="hint" role="status">
          Carregando inventário...
        </p>
      </main>
    );
  }

  const today = localDate(now);
  const down = fleet.reduce((sum, entry) => sum + entry.down, 0);

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
      <section aria-label="Equipamentos por tipo" className="summary-tiles">
        {fleet.map((entry) => (
          <button
            key={entry.type}
            type="button"
            className="summary-tile"
            aria-pressed={filters.type === entry.type}
            onClick={() =>
              setFilters({ ...filters, type: filters.type === entry.type ? "" : entry.type })
            }
          >
            <span className="summary-icon">
              <Glyph d={TYPE_GLYPHS[entry.type]} size={20} />
            </span>
            <span className="summary-text">
              <span className="summary-label">{EQUIPMENT_TYPES[entry.type].plural}</span>
              <span className="summary-figures">
                <span className="summary-count">{formatInteger(entry.total)}</span>
                {entry.down > 0 && (
                  <span className="summary-down">
                    <StatusShape status="malfunction" color={STATUS_COLORS.malfunction} size={11} />
                    {entry.down} {entry.down === 1 ? "parado" : "parados"}
                  </span>
                )}
              </span>
            </span>
          </button>
        ))}
      </section>
      <div className="inventory-layout">
        <aside className="panel inventory-filters">
          <OperationsFilters
            meta={meta}
            filters={filters}
            onChange={setFilters}
            matching={rows.length}
            total={snapshot.equipment.length}
            expanded
          />
        </aside>
        <div className="table-wrap" data-sticky="page">
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
                        setSort((current) => ({
                          key: column.key,
                          direction:
                            current.key === column.key ? (current.direction === 1 ? -1 : 1) : 1,
                        }))
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
                const days =
                  item.nextMaintenanceAt && item.status !== "stolen"
                    ? daysBetween(today, item.nextMaintenanceAt)
                    : null;
                const address = `${item.street}, ${item.reference}`;
                return (
                  <tr key={item.id}>
                    <td>
                      <button
                        type="button"
                        className="row-button"
                        onClick={() => navigate(`/equipamentos/${item.id}`)}
                      >
                        <Glyph d={TYPE_GLYPHS[item.type]} size={18} />
                        {item.serialNumber}
                      </button>
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
                      {days !== null && days < 0 && (
                        <span className="cell-alert">vencida há {-days} dia(s)</span>
                      )}
                      {item.maintenanceNeed === "immediate" && (
                        <span className="cell-alert">manutenção imediata</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatRelative(item.lastSeenAt, now)}</td>
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
