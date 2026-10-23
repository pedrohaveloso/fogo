import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  STATUS_COLORS,
  STATUS_LABELS,
  type EquipmentStatus,
} from "../../shared/catalog.ts";
import type { Meta } from "../../shared/types.ts";
import { StatusShape } from "../icons.tsx";
import { useMediaQuery } from "../useMediaQuery.ts";
import { FilterMenu } from "./FilterMenu.tsx";
import {
  EMPTY_FILTERS,
  PlaceFilterFields,
  placeFilterCount,
  type EquipmentFilters,
} from "./OperationsFilters.tsx";

const PHONE_WIDTH = "(max-width: 720px)";

type Props = {
  meta: Meta;
  filters: EquipmentFilters;
  onChange: (filters: EquipmentFilters) => void;
  matching: number;
  total: number;
  idPrefix: string;
  label: string;
  className: string;
  alwaysShowCount?: boolean;
};

export function EquipmentFilterBar({
  meta,
  filters,
  onChange,
  matching,
  total,
  idPrefix,
  label,
  className,
  alwaysShowCount = false,
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
  const phone = useMediaQuery(PHONE_WIDTH);
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const statusFields = (
    <fieldset className="filter-options">
      <legend className={phone ? "filter-group-title" : "visually-hidden"}>
        Situação do equipamento
      </legend>
      {EQUIPMENT_STATUSES.map((status) => (
        <label key={status} className="check">
          <input
            type="checkbox"
            checked={filters.statuses.includes(status)}
            onChange={() => toggleStatus(status)}
          />
          <StatusShape status={status} color={STATUS_COLORS[status]} size={12} />
          {STATUS_LABELS[status]}
        </label>
      ))}
    </fieldset>
  );
  const typeFields = (
    <fieldset className="filter-options">
      <legend className={phone ? "filter-group-title" : "visually-hidden"}>
        Tipo de equipamento
      </legend>
      <label className="check">
        <input
          type="radio"
          name={`${idPrefix}-type`}
          checked={filters.type === ""}
          onChange={() => set("type", "")}
        />
        Todos os tipos
      </label>
      {EQUIPMENT_TYPE_KEYS.map((type) => (
        <label key={type} className="check">
          <input
            type="radio"
            name={`${idPrefix}-type`}
            checked={filters.type === type}
            onChange={() => set("type", type)}
          />
          {EQUIPMENT_TYPES[type].label}
        </label>
      ))}
    </fieldset>
  );
  const placeFields = (
    <div className="filter-fields">
      <PlaceFilterFields idPrefix={idPrefix} meta={meta} filters={filters} onChange={onChange} />
    </div>
  );

  return (
    <search className={`filter-bar ${className}`} aria-label={label}>
      <label htmlFor={`${idPrefix}-search`} className="visually-hidden">
        Buscar equipamento
      </label>
      <input
        id={`${idPrefix}-search`}
        type="search"
        className="filter-search"
        placeholder="Buscar série, marca ou rua"
        value={filters.search}
        onChange={(event) => set("search", event.target.value)}
      />
      {phone ? (
        <FilterMenu
          label="Filtros"
          count={filters.statuses.length + (filters.type ? 1 : 0) + placeFilterCount(filters)}
        >
          <div className="filter-stack">
            {statusFields}
            {typeFields}
            {placeFields}
          </div>
        </FilterMenu>
      ) : (
        <>
          <FilterMenu label="Situação" count={filters.statuses.length}>
            {statusFields}
          </FilterMenu>
          <FilterMenu label="Tipo" count={filters.type ? 1 : 0}>
            {typeFields}
          </FilterMenu>
          <FilterMenu label="Mais filtros" count={placeFilterCount(filters)}>
            {placeFields}
          </FilterMenu>
        </>
      )}
      {(active || alwaysShowCount) && (
        <span className="filter-result" role="status">
          {matching} de {total} equipamentos
          {active && (
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              Limpar
            </button>
          )}
        </span>
      )}
    </search>
  );
}
