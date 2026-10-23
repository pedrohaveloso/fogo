import {
  AGENCIES,
  AGENCY_LABELS,
  UNAVAILABLE_STATUSES,
  type Agency,
  type EquipmentStatus,
  type EquipmentType,
} from "../../shared/catalog.ts";
import {
  MAINTENANCE_SOON_DAYS,
  maintenanceDaysLeft,
  maintenanceState,
} from "../../shared/maintenance.ts";
import type { Equipment, Meta } from "../../shared/types.ts";

export type MaintenanceFilter = "" | "urgent" | "immediate" | "overdue" | "soon";

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
  const search = filters.search.trim().toLowerCase();
  if (search) {
    return [item.serialNumber, item.brand, item.model, item.street, item.reference].some((field) =>
      field.toLowerCase().includes(search),
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
          <option value="urgent">Urgente (imediata ou vencida)</option>
          <option value="immediate">Manutenção imediata</option>
          <option value="overdue">Manutenção vencida</option>
          <option value="soon">Prevista nos próximos 7 dias</option>
        </select>
      </div>
    </>
  );
}
