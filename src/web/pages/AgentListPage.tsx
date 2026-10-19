import { useMemo, useState, type CSSProperties } from "react";
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
import { AgentGlyph, AgentShield, AgentStatusBadge } from "../components/badges.tsx";
import { formatInteger, formatRelative } from "../format.ts";
import { useLive, useMeta } from "../live.ts";
import { Link, navigate } from "../router.tsx";
import { agentStatusCounts } from "../summaries.ts";
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
  const counts = agentStatusCounts(snapshot.agents);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Agentes</h1>
          <p>
            Agentes de trânsito, guardas municipais e policiais que atuam nas operações de
            mobilidade e segurança. {formatInteger(counts.available + counts.responding)} em
            atividade agora, de {formatInteger(snapshot.agents.length)} cadastrados.
          </p>
        </div>
        <Link href="/agentes/novo" className="button button-primary">
          Cadastrar agente
        </Link>
      </div>
      <section
        aria-label="Agentes por situação"
        className="summary-tiles"
        style={{ "--tiles": 4 } as CSSProperties}
      >
        {AGENT_STATUSES.map((key) => (
          <button
            key={key}
            type="button"
            className="summary-tile"
            aria-pressed={status === key}
            onClick={() => setStatus(status === key ? "" : key)}
          >
            <span className="summary-icon">
              <AgentShield status={key} size={20} />
            </span>
            <span className="summary-text">
              <span className="summary-label">{AGENT_STATUS_LABELS[key]}</span>
              <span className="summary-count">{formatInteger(counts[key])}</span>
            </span>
          </button>
        ))}
      </section>
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
        <p className="hint toolbar-count">
          {rows.length} de {snapshot.agents.length} agentes
        </p>
      </div>
      <div className="table-wrap" data-sticky="page">
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
                    <span className="cell-sub">Matrícula {agent.badge}</span>
                  </td>
                  <td>
                    {AGENT_ROLES[agent.role].label}
                    {agent.rank && <span className="cell-sub">{agent.rank}</span>}
                  </td>
                  <td>
                    <AgentStatusBadge status={agent.status} />
                  </td>
                  <td>{SHIFTS[agent.shift]}</td>
                  <td>
                    {agent.baseName}
                    <span className="cell-sub">{names.get(agent.baseNeighborhoodId)}</span>
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
