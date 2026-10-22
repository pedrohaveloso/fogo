import {
  AGENCIES,
  AGENCY_LABELS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  STATUS_COLORS,
  STATUS_LABELS,
  type Agency,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import { daysBetween, localDate } from "../../shared/time.ts";
import type { Equipment, Meta } from "../../shared/types.ts";
import { StatusShape } from "../icons.tsx";

export type MaintenanceFilter = "" | "immediate" | "overdue" | "soon";

export type EquipmentFilters = {
  type: EquipmentType | "";
  statuses: EquipmentStatus[];
  regionId: string;
  neighborhoodId: string;
  agency: Agency | "";
  maintenance: MaintenanceFilter;
  search: string;
};

export const EMPTY_FILTERS: EquipmentFilters = {
  type: "",
  statuses: [],
  regionId: "",
  neighborhoodId: "",
  agency: "",
  maintenance: "",
  search: "",
};

export function matchesFilters(
  item: Equipment,
  filters: EquipmentFilters,
  meta: Meta,
  now: number,
): boolean {
  if (filters.type && item.type !== filters.type) {
    return false;
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes(item.status)) {
    return false;
  }
  if (filters.neighborhoodId && item.neighborhoodId !== filters.neighborhoodId) {
    return false;
  }
  if (filters.regionId) {
    const region = meta.neighborhoods.find(
      (neighborhood) => neighborhood.id === item.neighborhoodId,
    )?.regionId;
    if (region !== filters.regionId) {
      return false;
    }
  }
  if (filters.agency && item.agency !== filters.agency) {
    return false;
  }
  if (filters.maintenance) {
    const tracked =
      item.status !== "not_installed" && item.status !== "disabled" && item.status !== "stolen";
    const daysLeft =
      tracked && item.nextMaintenanceAt
        ? daysBetween(localDate(now), item.nextMaintenanceAt)
        : null;
    if (filters.maintenance === "immediate" && item.maintenanceNeed !== "immediate") {
      return false;
    }
    if (filters.maintenance === "overdue" && !(daysLeft !== null && daysLeft < 0)) {
      return false;
    }
    if (filters.maintenance === "soon" && !(daysLeft !== null && daysLeft >= 0 && daysLeft <= 7)) {
      return false;
    }
  }
  const search = filters.search.trim().toLowerCase();
  if (search) {
    return [item.serialNumber, item.brand, item.model, item.street, item.reference].some((field) =>
      field.toLowerCase().includes(search),
    );
  }
  return true;
}

type Props = {
  meta: Meta;
  filters: EquipmentFilters;
  onChange: (filters: EquipmentFilters) => void;
  matching: number;
  total: number;
  expanded?: boolean;
};

export function placeFilterCount(filters: EquipmentFilters): number {
  return [filters.regionId, filters.neighborhoodId, filters.agency, filters.maintenance].filter(
    Boolean,
  ).length;
}

export function advancedFilterCount(filters: EquipmentFilters): number {
  return (filters.type ? 1 : 0) + placeFilterCount(filters);
}

export function PlaceFilterFields({
  idPrefix,
  meta,
  filters,
  onChange,
}: {
  idPrefix: string;
  meta: Meta;
  filters: EquipmentFilters;
  onChange: (filters: EquipmentFilters) => void;
}) {
  const neighborhoods = meta.neighborhoods.filter(
    (item) => !filters.regionId || item.regionId === filters.regionId,
  );
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-region`}>Região</label>
        <select
          id={`${idPrefix}-region`}
          value={filters.regionId}
          onChange={(event) =>
            onChange({ ...filters, regionId: event.target.value, neighborhoodId: "" })
          }
        >
          <option value="">Toda a cidade</option>
          {meta.regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-neighborhood`}>Bairro</label>
        <select
          id={`${idPrefix}-neighborhood`}
          value={filters.neighborhoodId}
          onChange={(event) => onChange({ ...filters, neighborhoodId: event.target.value })}
        >
          <option value="">Todos os bairros</option>
          {neighborhoods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-agency`}>Órgão responsável</label>
        <select
          id={`${idPrefix}-agency`}
          value={filters.agency}
          onChange={(event) => onChange({ ...filters, agency: event.target.value as Agency | "" })}
        >
          <option value="">Todos os órgãos</option>
          {AGENCIES.map((agency) => (
            <option key={agency} value={agency}>
              {AGENCY_LABELS[agency]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-maintenance`}>Manutenção</label>
        <select
          id={`${idPrefix}-maintenance`}
          value={filters.maintenance}
          onChange={(event) =>
            onChange({ ...filters, maintenance: event.target.value as MaintenanceFilter })
          }
        >
          <option value="">Qualquer situação</option>
          <option value="immediate">Manutenção imediata</option>
          <option value="overdue">Manutenção vencida</option>
          <option value="soon">Prevista nos próximos 7 dias</option>
        </select>
      </div>
    </>
  );
}

export function OperationsFilters({
  meta,
  filters,
  onChange,
  matching,
  total,
  expanded = false,
}: Props) {
  const set = <K extends keyof EquipmentFilters>(key: K, value: EquipmentFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const toggleStatus = (status: EquipmentStatus) =>
    set(
      "statuses",
      filters.statuses.includes(status)
        ? filters.statuses.filter((item) => item !== status)
        : [...filters.statuses, status],
    );
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  const advanced = advancedFilterCount(filters);

  return (
    <section aria-labelledby="filters-title" className="filters">
      <h2 id="filters-title" className="section-title">
        Filtrar equipamentos
        <small>
          {matching} de {total}
        </small>
      </h2>
      <div className="field">
        <label htmlFor="filter-search" className="visually-hidden">
          Buscar equipamento
        </label>
        <input
          id="filter-search"
          type="search"
          placeholder="Buscar por série, marca ou rua"
          value={filters.search}
          onChange={(event) => set("search", event.target.value)}
        />
      </div>
      <fieldset className="field chip-fieldset">
        <legend className="label">Situação</legend>
        <div className="chip-group">
          {EQUIPMENT_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="chip"
              aria-pressed={filters.statuses.includes(status)}
              onClick={() => toggleStatus(status)}
            >
              <StatusShape status={status} color={STATUS_COLORS[status]} size={12} />
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="disclosure filters-more" open={expanded}>
        <summary>
          {advanced === 0
            ? "Mais filtros"
            : `Mais filtros (${advanced} ${advanced === 1 ? "ativo" : "ativos"})`}
        </summary>
        <div className="field">
          <label htmlFor="filter-type">Tipo de equipamento</label>
          <select
            id="filter-type"
            value={filters.type}
            onChange={(event) => set("type", event.target.value as EquipmentType | "")}
          >
            <option value="">Todos os tipos</option>
            {EQUIPMENT_TYPE_KEYS.map((type) => (
              <option key={type} value={type}>
                {EQUIPMENT_TYPES[type].label}
              </option>
            ))}
          </select>
        </div>
        <PlaceFilterFields idPrefix="filter" meta={meta} filters={filters} onChange={onChange} />
      </details>
      {active && (
        <button
          type="button"
          className="button button-small"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          Limpar filtros
        </button>
      )}
    </section>
  );
}
