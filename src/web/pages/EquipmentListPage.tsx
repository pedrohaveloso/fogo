import { useMemo, useState } from "react";
import { AGENCY_LABELS, EQUIPMENT_TYPES, STATUS_LABELS } from "../../shared/catalog.ts";
import { daysBetween, localDate } from "../../shared/time.ts";
import type { Equipment } from "../../shared/types.ts";
import { StatusBadge } from "../components/badges.tsx";
import {
  EMPTY_FILTERS,
  OperationsFilters,
  matchesFilters,
  type EquipmentFilters,
} from "../components/OperationsFilters.tsx";
import { formatDate, formatRelative } from "../format.ts";
import { Glyph, TYPE_GLYPHS } from "../icons.tsx";
import { useLive, useMeta } from "../live.ts";
import { Link, navigate } from "../router.tsx";
import { useNow } from "../useNow.ts";

type SortKey = "serial" | "type" | "status" | "neighborhood" | "maintenance" | "seen";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "serial", label: "Equipamento" },
  { key: "type", label: "Tipo" },
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

  const rows = useMemo(() => {
    if (!snapshot || !meta) {
      return [];
    }
    const value = (item: Equipment): string | number => {
      switch (sort.key) {
        case "serial":
          return item.serialNumber;
        case "type":
          return EQUIPMENT_TYPES[item.type].label;
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

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Equipamentos</h1>
          <p>
            Inventário dos equipamentos de trânsito e segurança instalados ou previstos para
            Marília.
          </p>
        </div>
        <Link href="/equipamentos/novo" className="button button-primary">
          Cadastrar equipamento
        </Link>
      </div>
      <div className="inventory-layout">
        <aside className="panel">
          <OperationsFilters
            meta={meta}
            filters={filters}
            onChange={setFilters}
            matching={rows.length}
            total={snapshot.equipment.length}
          />
        </aside>
        <div className="table-wrap" style={{ maxHeight: "calc(100dvh - 200px)" }}>
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
                      className="row-button"
                      onClick={() =>
                        setSort((current) => ({
                          key: column.key,
                          direction:
                            current.key === column.key ? (current.direction === 1 ? -1 : 1) : 1,
                        }))
                      }
                    >
                      {column.label}
                      {sort.key === column.key ? (sort.direction === 1 ? " ▲" : " ▼") : ""}
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
                      <div className="hint">
                        {item.brand} {item.model}
                      </div>
                    </td>
                    <td>{EQUIPMENT_TYPES[item.type].label}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {names.get(item.neighborhoodId)}
                      <div className="hint">
                        {item.street}, {item.reference}
                      </div>
                    </td>
                    <td>
                      {formatDate(item.nextMaintenanceAt)}
                      {days !== null && days < 0 && (
                        <div style={{ color: "#ff9d9d", fontSize: "0.85rem" }}>
                          vencida há {-days} dia(s)
                        </div>
                      )}
                      {item.maintenanceNeed === "immediate" && (
                        <div style={{ color: "#ff9d9d", fontSize: "0.85rem" }}>
                          manutenção imediata
                        </div>
                      )}
                    </td>
                    <td>{formatRelative(item.lastSeenAt, now)}</td>
                    <td>{AGENCY_LABELS[item.agency]}</td>
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
