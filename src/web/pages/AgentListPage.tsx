import { useMemo } from "react";
import {
  AGENT_ROLES,
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  AGENT_STATUS_LABELS,
  EQUIPMENT_TYPES,
  SHIFTS,
} from "../../shared/catalog.ts";
import {
  EMPTY_AGENT_FILTERS,
  compareAgents,
  matchesAgentFilters,
  type AgentFilters,
} from "../agentFilters.ts";
import { AgentShield, AgentStatusBadge } from "../components/badges.tsx";
import { FilterMenu } from "../components/FilterMenu.tsx";
import { formatInteger, formatRelative } from "../format.ts";
import { AGENT_ROLE_GLYPHS, Glyph } from "../icons.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { useLive, useMeta } from "../live.ts";
import { agentFromQuery, agentQuery } from "../listQuery.ts";
import { pageFromQuery, paginate, withPage } from "../pagination.ts";
import { Link, navigate, useLocation } from "../router.tsx";
import { agentStatusCounts } from "../summaries.ts";
import { useNow } from "../useNow.ts";

function setFilters(filters: AgentFilters, page = 1): void {
  navigate(`/agentes${withPage(agentQuery(filters), page)}`, { replace: true });
}

export function AgentListPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(30_000);
  const { params } = useLocation();
  const query = params.toString();
  const filters = useMemo(() => agentFromQuery(new URLSearchParams(query)), [query]);
  const set = <K extends keyof AgentFilters>(key: K, value: AgentFilters[K]) =>
    setFilters({ ...filters, [key]: value });

  const rows = useMemo(() => {
    if (!snapshot || !meta) {
      return [];
    }
    const regionOf = new Map(meta.neighborhoods.map((item) => [item.id, item.regionId]));
    return snapshot.agents
      .filter((agent) => matchesAgentFilters(agent, filters, regionOf))
      .sort(compareAgents);
  }, [snapshot, meta, filters]);

  if (!meta || !snapshot) {
    return <LoadingNotice label="Carregando agentes..." />;
  }

  const page = paginate(rows, pageFromQuery(params));
  const names = new Map(meta.neighborhoods.map((item) => [item.id, item.name]));
  const vehicles = new Map(snapshot.equipment.map((item) => [item.id, item]));
  const counts = agentStatusCounts(snapshot.agents);
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_AGENT_FILTERS);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Agentes</h1>
        <Link href="/agentes/novo" className="button button-primary">
          Cadastrar agente
        </Link>
      </div>
      <div className="inventory-stack">
        <p className="quick-filters">
          <span id="quick-filters-label">Agora:</span>
          {AGENT_STATUSES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filters.status === key}
              aria-describedby="quick-filters-label"
              onClick={() => set("status", filters.status === key ? "" : key)}
            >
              <AgentShield status={key} size={14} />
              {AGENT_STATUS_LABELS[key]}
              <strong>{formatInteger(counts[key])}</strong>
            </button>
          ))}
        </p>
        <search className="filter-bar page-filter-bar" aria-label="Filtrar agentes">
          <label htmlFor="agent-search" className="visually-hidden">
            Buscar agente
          </label>
          <input
            id="agent-search"
            type="search"
            className="filter-search"
            placeholder="Buscar nome ou matrícula"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
          <FilterMenu label="Função" count={filters.role ? 1 : 0}>
            <fieldset className="filter-options">
              <legend className="visually-hidden">Função do agente</legend>
              <label className="check">
                <input
                  type="radio"
                  name="agent-role"
                  checked={filters.role === ""}
                  onChange={() => set("role", "")}
                />
                Todas as funções
              </label>
              {AGENT_ROLE_KEYS.map((key) => (
                <label key={key} className="check">
                  <input
                    type="radio"
                    name="agent-role"
                    checked={filters.role === key}
                    onChange={() => set("role", key)}
                  />
                  <Glyph d={AGENT_ROLE_GLYPHS[key]} size={14} />
                  {AGENT_ROLES[key].label}
                </label>
              ))}
            </fieldset>
          </FilterMenu>
          <FilterMenu label="Região da base" count={filters.regionId ? 1 : 0}>
            <fieldset className="filter-options">
              <legend className="visually-hidden">Região da base</legend>
              <label className="check">
                <input
                  type="radio"
                  name="agent-region"
                  checked={filters.regionId === ""}
                  onChange={() => set("regionId", "")}
                />
                Toda a cidade
              </label>
              {meta.regions.map((region) => (
                <label key={region.id} className="check">
                  <input
                    type="radio"
                    name="agent-region"
                    checked={filters.regionId === region.id}
                    onChange={() => set("regionId", region.id)}
                  />
                  {region.name}
                </label>
              ))}
            </fieldset>
          </FilterMenu>
          <span className="filter-result" role="status">
            {rows.length} de {snapshot.agents.length} agentes
            {active && (
              <button
                type="button"
                className="button button-small button-ghost"
                onClick={() => setFilters(EMPTY_AGENT_FILTERS)}
              >
                Limpar
              </button>
            )}
          </span>
        </search>
        <div className="table-wrap inventory-table" data-sticky="page">
          <table>
            <caption className="visually-hidden">Lista de agentes</caption>
            <thead>
              <tr>
                <th scope="col">Agente</th>
                <th scope="col">Situação</th>
                <th scope="col">Base</th>
                <th scope="col">Turno</th>
                <th scope="col">Veículo</th>
                <th scope="col">Última posição</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhum agente corresponde aos filtros.{" "}
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => setFilters(EMPTY_AGENT_FILTERS)}
                    >
                      Limpar filtros
                    </button>
                  </td>
                </tr>
              )}
              {page.items.map((agent) => {
                const vehicle =
                  agent.vehicleId === null ? undefined : vehicles.get(agent.vehicleId);
                return (
                  <tr key={agent.id}>
                    <td>
                      <Link href={`/agentes/${agent.id}`} className="row-button">
                        <Glyph d={AGENT_ROLE_GLYPHS[agent.role]} size={18} />
                        {agent.name}
                      </Link>
                      <span className="cell-sub">
                        {AGENT_ROLES[agent.role].label}
                        {agent.rank ? `, ${agent.rank}` : ""} · {agent.badge}
                      </span>
                    </td>
                    <td>
                      <AgentStatusBadge status={agent.status} />
                    </td>
                    <td>
                      {agent.baseName}
                      <span className="cell-sub">{names.get(agent.baseNeighborhoodId)}</span>
                    </td>
                    <td>{SHIFTS[agent.shift]}</td>
                    <td>
                      {vehicle
                        ? `${EQUIPMENT_TYPES[vehicle.type].label} ${String(vehicle.attributes["plate"] ?? "")}`
                        : "A pé"}
                    </td>
                    <td>{formatRelative(agent.lastSeenAt, now)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} label="agentes" onChange={(next) => setFilters(filters, next)} />
      </div>
    </main>
  );
}
