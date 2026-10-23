import { useEffect, useRef, useState, type ReactNode } from "react";
import { silentMinutes } from "../../shared/telemetry.ts";
import { InlineLoading } from "./LoadingNotice.tsx";
import {
  AGENCY_LABELS,
  AGENT_ROLES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  MAINTENANCE_LABELS,
  OCCURRENCE_KINDS,
  SHIFTS,
  STATUS_LABELS,
  type EquipmentStatus,
  type Severity,
} from "../../shared/catalog.ts";
import { daysBetween, localDate } from "../../shared/time.ts";
import type {
  Agent,
  AreaHealth,
  Equipment,
  Meta,
  Occurrence,
  OperationsSnapshot,
} from "../../shared/types.ts";
import { formatMaintenanceDue } from "../../shared/text.ts";
import { api, ApiError } from "../api.ts";
import {
  formatDate,
  formatDateTime,
  formatHour,
  formatInteger,
  formatPercent,
  formatRelative,
} from "../format.ts";
import type { Selection } from "../map/OperationsMap.tsx";
import { Link } from "../router.tsx";
import { CLOSE_GLYPH, Glyph } from "../icons.tsx";
import { useFetch } from "../useFetch.ts";
import { AgentStatusBadge, HealthTag, SeverityBadge, StatusBadge, TypeLabel } from "./badges.tsx";
import { LineChart } from "./charts/LineChart.tsx";

type EquipmentDetails = {
  equipment: Equipment;
  history: { status: EquipmentStatus; reason: string; at: string }[];
  readings: { hourStart: string; count: number }[];
  occurrences: {
    id: number;
    kind: keyof typeof OCCURRENCE_KINDS;
    severity: Severity;
    status: string;
    description: string;
    createdAt: string;
  }[];
  operator: Agent | null;
};

type AgentDetails = {
  agent: Agent;
  vehicle: Equipment | null;
  occurrences: EquipmentDetails["occurrences"];
};

function attributeText(equipment: Equipment): { label: string; value: string }[] {
  return EQUIPMENT_TYPES[equipment.type].attributes.flatMap((spec) => {
    const value = equipment.attributes[spec.key];
    if (value === undefined || value === "") {
      return [];
    }
    if (spec.kind === "boolean") {
      return [{ label: spec.label, value: value ? "Sim" : "Não" }];
    }
    if (spec.kind === "select") {
      return [{ label: spec.label, value: spec.options[String(value)] ?? String(value) }];
    }
    if (spec.kind === "number") {
      return [{ label: spec.label, value: `${value}${spec.unit ? ` ${spec.unit}` : ""}` }];
    }
    return [{ label: spec.label, value: String(value) }];
  });
}

function maintenanceSummary(item: Equipment, now: number): string {
  if (!item.nextMaintenanceAt) {
    return "Sem data prevista";
  }
  const days = daysBetween(localDate(now), item.nextMaintenanceAt);
  return `${formatDate(item.nextMaintenanceAt)}, ${formatMaintenanceDue(days)}`;
}

function EquipmentPanel({
  id,
  live,
  now,
  meta,
}: {
  id: number;
  live: Equipment | undefined;
  now: number;
  meta: Meta;
}) {
  const { data, error, reload } = useFetch<EquipmentDetails>(`/equipment/${id}`, 30_000);
  const item = live ?? data?.equipment;
  if (error && !item) {
    return <p className="error-box">{error}</p>;
  }
  if (!item) {
    return <InlineLoading label="Carregando..." onRetry={reload} />;
  }
  const neighborhood = meta.neighborhoods.find((entry) => entry.id === item.neighborhoodId);
  const readings = data?.readings ?? [];
  return (
    <>
      <div className="badge-row">
        <StatusBadge status={item.status} />
        {item.maintenanceNeed === "immediate" ? (
          <span className="plate" data-level="warning">
            Manutenção {MAINTENANCE_LABELS[item.maintenanceNeed].toLowerCase()}
          </span>
        ) : (
          <span className="badge">{MAINTENANCE_LABELS[item.maintenanceNeed]}</span>
        )}
      </div>
      <dl className="facts">
        <dt>Tipo</dt>
        <dd>
          <TypeLabel type={item.type} />
        </dd>
        <dt>Marca e modelo</dt>
        <dd>
          {item.brand} {item.model}
        </dd>
        <dt>Órgão</dt>
        <dd>{AGENCY_LABELS[item.agency]}</dd>
        <dt>Endereço</dt>
        <dd>
          {item.street}, {item.reference}
          <br />
          {neighborhood?.name}, {item.city}/{item.uf}, CEP {item.cep}
        </dd>
        <dt>Coordenadas</dt>
        <dd>
          {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
        </dd>
        <dt>Instalação</dt>
        <dd>{formatDate(item.installedAt)}</dd>
        <dt>Última comunicação</dt>
        <dd>
          {formatRelative(item.lastSeenAt, now)}
          {silentMinutes(item, now) !== null && (
            <span className="cell-warning">
              Sem comunicação: o equipamento consta como operacional, mas parou de enviar dados
            </span>
          )}
        </dd>
        {item.battery !== null && (
          <>
            <dt>Bateria</dt>
            <dd>{formatPercent(item.battery)}</dd>
          </>
        )}
        {data?.operator && (
          <>
            <dt>Em uso por</dt>
            <dd>{data.operator.name}</dd>
          </>
        )}
      </dl>
      <section>
        <h3 className="section-title">Manutenção</h3>
        <dl className="facts">
          <dt>Próxima</dt>
          <dd>{maintenanceSummary(item, now)}</dd>
          <dt>Última</dt>
          <dd>{formatDate(item.lastMaintenanceAt)}</dd>
          <dt>Periodicidade</dt>
          <dd>
            {item.maintenanceIntervalDays ? `${item.maintenanceIntervalDays} dias` : "Não definida"}
          </dd>
          {item.maintenanceNotes && (
            <>
              <dt>Observações</dt>
              <dd>{item.maintenanceNotes}</dd>
            </>
          )}
        </dl>
      </section>
      {attributeText(item).length > 0 && (
        <section>
          <h3 className="section-title">Características</h3>
          <dl className="facts">
            {attributeText(item).map((entry) => (
              <div key={entry.label} style={{ display: "contents" }}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {readings.length > 1 && (
        <section>
          <h3 className="section-title">
            Telemetria nas últimas 48 horas
            <small>
              {formatInteger(readings.reduce((sum, entry) => sum + entry.count, 0))} registros
            </small>
          </h3>
          <LineChart
            title="Registros por hora"
            series={[
              {
                key: "count",
                label: "Registros por hora",
                color: "#3987e5",
                values: readings.map((entry) => entry.count),
              },
            ]}
            xLabels={readings.map((entry) =>
              formatHour(new Date(Date.parse(entry.hourStart) - 3 * 3_600_000).getUTCHours()),
            )}
            yFormat={(value) => formatInteger(value)}
            height={170}
          />
        </section>
      )}
      {data && data.history.length > 0 && (
        <section>
          <h3 className="section-title">Histórico de situação</h3>
          <ol className="timeline">
            {data.history.map((entry) => (
              <li key={`${entry.at}-${entry.status}`}>
                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                <span>
                  {STATUS_LABELS[entry.status]}
                  {entry.reason ? `: ${entry.reason}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Link href={`/equipamentos/${item.id}`} className="button">
        Editar cadastro
      </Link>
    </>
  );
}

function AgentPanel({
  id,
  live,
  now,
  meta,
  occurrences,
}: {
  id: number;
  live: Agent | undefined;
  now: number;
  meta: Meta;
  occurrences: Occurrence[];
}) {
  const { data, error, reload } = useFetch<AgentDetails>(`/agents/${id}`, 30_000);
  const agent = live ?? data?.agent;
  if (error && !agent) {
    return <p className="error-box">{error}</p>;
  }
  if (!agent) {
    return <InlineLoading label="Carregando..." onRetry={reload} />;
  }
  const current = occurrences.find((item) => item.id === agent.occurrenceId);
  return (
    <>
      <div>
        <AgentStatusBadge status={agent.status} />
      </div>
      <dl className="facts">
        <dt>Função</dt>
        <dd>
          {AGENT_ROLES[agent.role].label}
          {agent.rank ? `, ${agent.rank}` : ""}
        </dd>
        <dt>Matrícula</dt>
        <dd>{agent.badge}</dd>
        <dt>Órgão</dt>
        <dd>{AGENCY_LABELS[agent.agency]}</dd>
        <dt>Turno</dt>
        <dd>{SHIFTS[agent.shift]}</dd>
        <dt>Base</dt>
        <dd>
          {agent.baseName},{" "}
          {meta.neighborhoods.find((item) => item.id === agent.baseNeighborhoodId)?.name}
        </dd>
        <dt>Contato</dt>
        <dd>{agent.phone || "Não informado"}</dd>
        <dt>Veículo</dt>
        <dd>
          {data?.vehicle
            ? `${EQUIPMENT_TYPES[data.vehicle.type].label} ${String(data.vehicle.attributes["plate"] ?? data.vehicle.serialNumber)}`
            : "A pé"}
        </dd>
        <dt>Última posição</dt>
        <dd>{formatRelative(agent.lastSeenAt, now)}</dd>
      </dl>
      {current && (
        <section>
          <h3 className="section-title">Atendimento em curso</h3>
          <p>
            {OCCURRENCE_KINDS[current.kind].label}: {current.description}
          </p>
        </section>
      )}
      {data && data.occurrences.length > 0 && (
        <section>
          <h3 className="section-title">Atendimentos nos últimos 7 dias</h3>
          <ol className="timeline">
            {data.occurrences.map((entry) => (
              <li key={entry.id}>
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                <span>{OCCURRENCE_KINDS[entry.kind].label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Link href={`/agentes/${agent.id}`} className="button">
        Editar cadastro
      </Link>
    </>
  );
}

function OccurrencePanel({
  occurrence,
  snapshot,
  meta,
  onClose,
}: {
  occurrence: Occurrence;
  snapshot: OperationsSnapshot;
  meta: Meta;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const agent = snapshot.agents.find((item) => item.id === occurrence.agentId);
  const equipment = snapshot.equipment.find((item) => item.id === occurrence.equipmentId);

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/occurrences/${occurrence.id}/resolve`);
      onClose();
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : "Não foi possível encerrar a ocorrência.",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <div className="badge-row">
        <SeverityBadge severity={occurrence.severity} />
        <span className="badge">
          {occurrence.status === "responding" ? "Em atendimento" : "Aguardando equipe"}
        </span>
      </div>
      <p>{occurrence.description}</p>
      <dl className="facts">
        <dt>Bairro</dt>
        <dd>{meta.neighborhoods.find((item) => item.id === occurrence.neighborhoodId)?.name}</dd>
        <dt>Registrada</dt>
        <dd>{formatDateTime(occurrence.createdAt)}</dd>
        <dt>Equipe</dt>
        <dd>
          {agent ? `${agent.name} (${AGENT_ROLES[agent.role].label})` : "Nenhuma equipe designada"}
        </dd>
        {equipment && (
          <>
            <dt>Equipamento</dt>
            <dd>
              {EQUIPMENT_TYPES[equipment.type].label} {equipment.serialNumber}
            </dd>
          </>
        )}
      </dl>
      {error && <p className="error-box">{error}</p>}
      <button type="button" className="button" disabled={busy} onClick={() => void resolve()}>
        Encerrar ocorrência
      </button>
    </>
  );
}

function NeighborhoodPanel({
  id,
  snapshot,
  onFilter,
}: {
  id: string;
  snapshot: OperationsSnapshot;
  onFilter: (id: string) => void;
}) {
  const health: AreaHealth | undefined = snapshot.neighborhoods.find((item) => item.id === id);
  const items = snapshot.equipment.filter((item) => item.neighborhoodId === id);
  const open = snapshot.occurrences.filter((item) => item.neighborhoodId === id);
  if (!health) {
    return null;
  }
  return (
    <>
      <div>
        <HealthTag level={health.level} />
      </div>
      {health.reasons.length > 0 && <p className="hint">{health.reasons.join("; ")}</p>}
      <dl className="facts">
        <dt>Disponibilidade</dt>
        <dd>
          {formatPercent(health.availabilityPct)} ({health.operational} de{" "}
          {health.operational + health.unavailable})
        </dd>
        <dt>Agentes na área</dt>
        <dd>{health.agentsActive}</dd>
        <dt>Ocorrências abertas</dt>
        <dd>{open.length}</dd>
        {EQUIPMENT_STATUSES.map((status) => {
          const count = items.filter((item) => item.status === status).length;
          return count === 0 ? null : (
            <div key={status} style={{ display: "contents" }}>
              <dt>{STATUS_LABELS[status]}</dt>
              <dd>{count}</dd>
            </div>
          );
        })}
      </dl>
      {open.length > 0 && (
        <ol className="timeline">
          {open.map((item) => (
            <li key={item.id}>
              <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
              <span>{OCCURRENCE_KINDS[item.kind].label}</span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="button" onClick={() => onFilter(id)}>
        Filtrar equipamentos deste bairro
      </button>
    </>
  );
}

type Props = {
  selection: Selection;
  snapshot: OperationsSnapshot;
  meta: Meta;
  now: number;
  onClose: () => void;
  onFilterNeighborhood: (id: string) => void;
};

export function DetailDrawer({
  selection,
  snapshot,
  meta,
  now,
  onClose,
  onFilterNeighborhood,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let title = "";
  let kind = "";
  let body: ReactNode = null;
  if (selection.kind === "equipment") {
    kind = "Equipamento";
    const item = snapshot.equipment.find((entry) => entry.id === selection.id);
    title = item ? `${EQUIPMENT_TYPES[item.type].label} ${item.serialNumber}` : "Equipamento";
    body = <EquipmentPanel id={selection.id} live={item} now={now} meta={meta} />;
  } else if (selection.kind === "agent") {
    kind = "Agente";
    const agent = snapshot.agents.find((entry) => entry.id === selection.id);
    title = agent?.name ?? "Agente";
    body = (
      <AgentPanel
        id={selection.id}
        live={agent}
        now={now}
        meta={meta}
        occurrences={snapshot.occurrences}
      />
    );
  } else if (selection.kind === "occurrence") {
    kind = "Ocorrência";
    const occurrence = snapshot.occurrences.find((entry) => entry.id === selection.id);
    title = occurrence ? OCCURRENCE_KINDS[occurrence.kind].label : "Ocorrência encerrada";
    body = occurrence ? (
      <OccurrencePanel occurrence={occurrence} snapshot={snapshot} meta={meta} onClose={onClose} />
    ) : (
      <p className="hint">Esta ocorrência já foi encerrada.</p>
    );
  } else {
    kind = "Bairro";
    title = meta.neighborhoods.find((entry) => entry.id === selection.id)?.name ?? "Bairro";
    body = (
      <NeighborhoodPanel id={selection.id} snapshot={snapshot} onFilter={onFilterNeighborhood} />
    );
  }

  return (
    <aside className="drawer" aria-labelledby="drawer-title">
      <div className="drawer-head">
        <div>
          <p className="drawer-kind">{kind}</p>
          <h2 id="drawer-title" className="drawer-title">
            {title}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="button button-ghost button-icon"
          onClick={onClose}
          aria-label="Fechar detalhes"
          title="Fechar (Esc)"
        >
          <Glyph d={CLOSE_GLYPH} size={18} />
        </button>
      </div>
      <div className="drawer-body">{body}</div>
    </aside>
  );
}
