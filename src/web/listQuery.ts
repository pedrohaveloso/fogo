import {
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  type AgentRole,
  type AgentStatus,
  type EquipmentStatus,
  type EquipmentType,
} from "../shared/catalog.ts";
import { EMPTY_AGENT_FILTERS, type AgentFilters } from "./agentFilters.ts";
import {
  EMPTY_FILTERS,
  type EquipmentFilters,
  type MaintenanceFilter,
} from "./components/OperationsFilters.tsx";

export const SORT_KEYS = ["serial", "status", "neighborhood", "maintenance", "seen"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type Sort = { key: SortKey; direction: 1 | -1 };
export const DEFAULT_SORT: Sort = { key: "serial", direction: 1 };

const MAINTENANCE_FILTERS: readonly MaintenanceFilter[] = [
  "urgent",
  "immediate",
  "overdue",
  "soon",
];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function build(entries: [string, string][]): string {
  const params = new URLSearchParams(entries.filter(([, value]) => value !== ""));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function equipmentQuery(filters: EquipmentFilters, sort: Sort): string {
  const sortValue =
    sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction
      ? ""
      : `${sort.key}${sort.direction === -1 ? "-desc" : ""}`;
  return build([
    ["search", filters.search],
    ["type", filters.type],
    ["status", filters.statuses.join(",")],
    ["region", filters.regionId],
    ["neighborhood", filters.neighborhoodId],
    ["agency", filters.agency],
    ["maintenance", filters.maintenance],
    ["sort", sortValue],
  ]);
}

export function equipmentFromQuery(params: URLSearchParams): {
  filters: EquipmentFilters;
  sort: Sort;
} {
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((value): value is EquipmentStatus =>
      (EQUIPMENT_STATUSES as readonly string[]).includes(value),
    );
  const [sortKey, descending] = (params.get("sort") ?? "").split("-");
  const key = oneOf(sortKey ?? null, SORT_KEYS);
  return {
    filters: {
      ...EMPTY_FILTERS,
      search: params.get("search") ?? "",
      type: oneOf<EquipmentType>(params.get("type"), EQUIPMENT_TYPE_KEYS),
      statuses,
      regionId: params.get("region") ?? "",
      neighborhoodId: params.get("neighborhood") ?? "",
      agency: /^\d+$/.test(params.get("agency") ?? "") ? params.get("agency")! : "",
      maintenance: oneOf(params.get("maintenance"), MAINTENANCE_FILTERS),
    },
    sort: key ? { key, direction: descending === "desc" ? -1 : 1 } : DEFAULT_SORT,
  };
}

export function agentQuery(filters: AgentFilters): string {
  return build([
    ["search", filters.search],
    ["role", filters.role],
    ["status", filters.status],
    ["region", filters.regionId],
  ]);
}

export function agentFromQuery(params: URLSearchParams): AgentFilters {
  return {
    ...EMPTY_AGENT_FILTERS,
    search: params.get("search") ?? "",
    role: oneOf<AgentRole>(params.get("role"), AGENT_ROLE_KEYS),
    status: oneOf<AgentStatus>(params.get("status"), AGENT_STATUSES),
    regionId: params.get("region") ?? "",
  };
}

export function withMapView(query: string, map: boolean): string {
  if (!map) {
    return query;
  }
  const params = new URLSearchParams(query);
  params.set("view", "map");
  return `?${params.toString()}`;
}

export function showsMapView(params: URLSearchParams): boolean {
  return params.get("view") === "map";
}

export function withoutMapView(query: string): string {
  const params = new URLSearchParams(query);
  params.delete("view");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export function searchQuery(search: string): string {
  return build([["search", search]]);
}
