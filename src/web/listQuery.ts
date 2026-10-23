import {
  AGENCIES,
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  type Agency,
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
    ["busca", filters.search],
    ["tipo", filters.type],
    ["situacao", filters.statuses.join(",")],
    ["regiao", filters.regionId],
    ["bairro", filters.neighborhoodId],
    ["orgao", filters.agency],
    ["manutencao", filters.maintenance],
    ["ordem", sortValue],
  ]);
}

export function equipmentFromQuery(params: URLSearchParams): {
  filters: EquipmentFilters;
  sort: Sort;
} {
  const statuses = (params.get("situacao") ?? "")
    .split(",")
    .filter((value): value is EquipmentStatus =>
      (EQUIPMENT_STATUSES as readonly string[]).includes(value),
    );
  const [sortKey, descending] = (params.get("ordem") ?? "").split("-");
  const key = oneOf(sortKey ?? null, SORT_KEYS);
  return {
    filters: {
      ...EMPTY_FILTERS,
      search: params.get("busca") ?? "",
      type: oneOf<EquipmentType>(params.get("tipo"), EQUIPMENT_TYPE_KEYS),
      statuses,
      regionId: params.get("regiao") ?? "",
      neighborhoodId: params.get("bairro") ?? "",
      agency: oneOf<Agency>(params.get("orgao"), AGENCIES),
      maintenance: oneOf(params.get("manutencao"), MAINTENANCE_FILTERS),
    },
    sort: key ? { key, direction: descending === "desc" ? -1 : 1 } : DEFAULT_SORT,
  };
}

export function agentQuery(filters: AgentFilters): string {
  return build([
    ["busca", filters.search],
    ["funcao", filters.role],
    ["situacao", filters.status],
    ["regiao", filters.regionId],
  ]);
}

export function agentFromQuery(params: URLSearchParams): AgentFilters {
  return {
    ...EMPTY_AGENT_FILTERS,
    search: params.get("busca") ?? "",
    role: oneOf<AgentRole>(params.get("funcao"), AGENT_ROLE_KEYS),
    status: oneOf<AgentStatus>(params.get("situacao"), AGENT_STATUSES),
    regionId: params.get("regiao") ?? "",
  };
}
