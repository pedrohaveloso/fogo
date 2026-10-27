import {
  UNAVAILABLE_STATUSES,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import {
  MAINTENANCE_SOON_DAYS,
  maintenanceDaysLeft,
  maintenanceState,
} from "../../shared/maintenance.ts";
import { fold } from "../../shared/text.ts";
import type { Equipment, Meta } from "../../shared/types.ts";
import { Select } from "./Select.tsx";

export type MaintenanceFilter = "" | "urgent" | "immediate" | "overdue" | "soon";

const MAINTENANCE_OPTIONS = [
  { value: "", label: "Qualquer situação" },
  { value: "urgent", label: "Urgente (imediata ou vencida)" },
  { value: "immediate", label: "Manutenção imediata" },
  { value: "overdue", label: "Manutenção vencida" },
  { value: "soon", label: "Prevista nos próximos 7 dias" },
];

export type EquipmentFilters = {
  type: EquipmentType | "";
  statuses: EquipmentStatus[];
  regionId: string;
  neighborhoodId: string;
  agency: string;
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
  if (filters.agency && item.agencyId !== Number(filters.agency)) {
    return false;
  }
  if (filters.maintenance) {
    const daysLeft = maintenanceDaysLeft(item, now);
    if (filters.maintenance === "urgent" && maintenanceState(item, now) !== "urgent") {
      return false;
    }
    if (filters.maintenance === "immediate" && item.maintenanceNeed !== "immediate") {
      return false;
    }
    if (filters.maintenance === "overdue" && !(daysLeft !== null && daysLeft < 0)) {
      return false;
    }
    if (
      filters.maintenance === "soon" &&
      !(daysLeft !== null && daysLeft >= 0 && daysLeft <= MAINTENANCE_SOON_DAYS)
    ) {
      return false;
    }
  }
  const search = fold(filters.search);
  if (search) {
    return [item.serialNumber, item.brand, item.model, item.street, item.reference].some((field) =>
      fold(field).includes(search),
    );
  }
  return true;
}

export function showsUnavailableOnly(filters: EquipmentFilters): boolean {
  return (
    filters.statuses.length === UNAVAILABLE_STATUSES.length &&
    UNAVAILABLE_STATUSES.every((status) => filters.statuses.includes(status))
  );
}

export function toggleUnavailable(filters: EquipmentFilters): EquipmentFilters {
  return {
    ...filters,
    statuses: showsUnavailableOnly(filters) ? [] : [...UNAVAILABLE_STATUSES],
  };
}

export function showsDownOfType(filters: EquipmentFilters, type: EquipmentType): boolean {
  return filters.type === type && showsUnavailableOnly(filters);
}

export function toggleDownOfType(filters: EquipmentFilters, type: EquipmentType): EquipmentFilters {
  return showsDownOfType(filters, type)
    ? { ...filters, type: "", statuses: [] }
    : { ...filters, type, statuses: [...UNAVAILABLE_STATUSES] };
}

export function toggleUrgentMaintenance(filters: EquipmentFilters): EquipmentFilters {
  return { ...filters, maintenance: filters.maintenance === "urgent" ? "" : "urgent" };
}

export function placeFilterCount(filters: EquipmentFilters): number {
  return [filters.regionId, filters.neighborhoodId, filters.agency, filters.maintenance].filter(
    Boolean,
  ).length;
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
        <Select
          id={`${idPrefix}-region`}
          value={filters.regionId}
          options={[
            { value: "", label: "Toda a cidade" },
            ...meta.regions.map((region) => ({ value: region.id, label: region.name })),
          ]}
          onChange={(value) => onChange({ ...filters, regionId: value, neighborhoodId: "" })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-neighborhood`}>Bairro</label>
        <Select
          id={`${idPrefix}-neighborhood`}
          value={filters.neighborhoodId}
          options={[
            { value: "", label: "Todos os bairros" },
            ...neighborhoods.map((item) => ({ value: item.id, label: item.name })),
          ]}
          onChange={(value) => onChange({ ...filters, neighborhoodId: value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-agency`}>Órgão responsável</label>
        <Select
          id={`${idPrefix}-agency`}
          value={filters.agency}
          options={[
            { value: "", label: "Todos os órgãos" },
            ...meta.agencies.map((agency) => ({ value: String(agency.id), label: agency.name })),
          ]}
          onChange={(value) => onChange({ ...filters, agency: value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-maintenance`}>Manutenção</label>
        <Select
          id={`${idPrefix}-maintenance`}
          value={filters.maintenance}
          options={MAINTENANCE_OPTIONS}
          onChange={(value) => onChange({ ...filters, maintenance: value as MaintenanceFilter })}
        />
      </div>
    </>
  );
}
