import { useMemo, useState } from "react";
import {
  AGENT_ROLES,
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  AGENT_STATUS_LABELS,
  EQUIPMENT_TYPES,
  SHIFTS,
  type AgentRole,
  type AgentStatus,
} from "../../shared/catalog.ts";
import { AgentGlyph, AgentStatusBadge } from "../components/badges.tsx";
import { formatRelative } from "../format.ts";
import { useLive, useMeta } from "../live.ts";
import { Link, navigate } from "../router.tsx";
import { useNow } from "../useNow.ts";

export function AgentListPage() {
  const meta = useMeta();
  const { snapshot } = useLive();
  const now = useNow(30_000);
  const [role, setRole] = useState<AgentRole | "">("");
  const [status, setStatus] = useState<AgentStatus | "">("");
  const [regionId, setRegionId] = useState("");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    if (!snapshot || !meta) {
      return [];
    }
    const regionOf = new Map(meta.neighborhoods.map((item) => [item.id, item.regionId]));
    const term = search.trim().toLowerCase();
    return snapshot.agents
      .filter(
        (agent) =>
          (!role || agent.role === role) &&
          (!status || agent.status === status) &&
          (!regionId || regionOf.get(agent.baseNeighborhoodId) === regionId) &&
          (!term ||
            agent.name.toLowerCase().includes(term) ||
            agent.badge.toLowerCase().includes(term)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [snapshot, meta, role, status, regionId, search]);

  if (!meta || !snapshot) {
    return (
      <main className="page">
        <p className="hint" role="status">
          Carregando agentes...
        </p>
      </main>
    );
  }

  const names = new Map(meta.neighborhoods.map((item) => [item.id, item.name]));
  const vehicles = new Map(snapshot.equipment.map((item) => [item.id, item]));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Agentes</h1>
          <p>
            Agentes de trânsito, guardas municipais e policiais que atuam nas operações de
            mobilidade e segurança.
          </p>
        </div>
        <Link href="/agentes/novo" className="button button-primary">
          Cadastrar agente
        </Link>
      </div>
      <div className="toolbar panel">
        <div className="field">
          <label htmlFor="agent-search">Buscar</label>
          <input
            id="agent-search"
            type="search"
            placeholder="Nome ou matrícula"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="agent-role">Função</label>
          <select
            id="agent-role"
            value={role}
            onChange={(event) => setRole(event.target.value as AgentRole | "")}
          >
            <option value="">Todas</option>
            {AGENT_ROLE_KEYS.map((key) => (
              <option key={key} value={key}>
                {AGENT_ROLES[key].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="agent-status">Situação</label>
          <select
            id="agent-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AgentStatus | "")}
          >
            <option value="">Todas</option>
            {AGENT_STATUSES.map((key) => (
              <option key={key} value={key}>
                {AGENT_STATUS_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="agent-region">Região da base</label>
          <select
            id="agent-region"
            value={regionId}
            onChange={(event) => setRegionId(event.target.value)}
          >
            <option value="">Toda a cidade</option>
            {meta.regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>
        <p className="hint" style={{ alignSelf: "center" }}>
          {rows.length} de {snapshot.agents.length} agentes
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">Lista de agentes</caption>
          <thead>
            <tr>
              <th scope="col">Agente</th>
              <th scope="col">Função</th>
              <th scope="col">Situação</th>
              <th scope="col">Turno</th>
              <th scope="col">Base</th>
              <th scope="col">Veículo</th>
              <th scope="col">Última posição</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhum agente corresponde aos filtros.
                </td>
              </tr>
            )}
            {rows.map((agent) => {
              const vehicle = agent.vehicleId === null ? undefined : vehicles.get(agent.vehicleId);
              return (
                <tr key={agent.id}>
                  <td>
                    <button
                      type="button"
                      className="row-button"
                      onClick={() => navigate(`/agentes/${agent.id}`)}
                    >
                      <AgentGlyph />
                      {agent.name}
                    </button>
                    <div className="hint">Matrícula {agent.badge}</div>
                  </td>
                  <td>
                    {AGENT_ROLES[agent.role].label}
                    {agent.rank && <div className="hint">{agent.rank}</div>}
                  </td>
                  <td>
                    <AgentStatusBadge status={agent.status} />
                  </td>
                  <td>{SHIFTS[agent.shift]}</td>
                  <td>
                    {agent.baseName}
                    <div className="hint">{names.get(agent.baseNeighborhoodId)}</div>
                  </td>
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
    </main>
  );
}
