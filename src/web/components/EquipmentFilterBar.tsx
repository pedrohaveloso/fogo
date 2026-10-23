import { useEffect, useRef, type ReactNode } from "react";
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
import {
  EMPTY_FILTERS,
  PlaceFilterFields,
  placeFilterCount,
  type EquipmentFilters,
} from "./OperationsFilters.tsx";

function FilterMenu({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const details = ref.current;
      if (!details?.open) {
        return;
      }
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          details.open = false;
          details.querySelector("summary")?.focus();
        }
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="filter-menu">
      <summary data-active={count > 0}>
        {label}
        {count > 0 && <span className="filter-menu-count">{count}</span>}
      </summary>
      <div className="filter-menu-body">{children}</div>
    </details>
  );
}

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
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

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
      <FilterMenu label="Situação" count={filters.statuses.length}>
        <fieldset className="filter-options">
          <legend className="visually-hidden">Situação do equipamento</legend>
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
      </FilterMenu>
      <FilterMenu label="Tipo" count={filters.type ? 1 : 0}>
        <fieldset className="filter-options">
          <legend className="visually-hidden">Tipo de equipamento</legend>
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
      </FilterMenu>
      <FilterMenu label="Mais filtros" count={placeFilterCount(filters)}>
        <div className="filter-fields">
          <PlaceFilterFields
            idPrefix={idPrefix}
            meta={meta}
            filters={filters}
            onChange={onChange}
          />
        </div>
      </FilterMenu>
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
