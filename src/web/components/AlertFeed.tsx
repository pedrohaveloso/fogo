import { useState } from "react";
import type { Alert, AlertCategory } from "../../shared/types.ts";
import { api } from "../api.ts";
import { ALERT_CATEGORY_LABELS, ALERT_LABELS } from "../colors.ts";
import { formatRelative } from "../format.ts";

export type AlertFilterKey =
  | "all"
  | "critical"
  | "equipment"
  | "occurrence"
  | "anomaly"
  | "maintenance";

const FILTERS: { key: AlertFilterKey; label: string; categories?: AlertCategory[] }[] = [
  { key: "all", label: "Todos" },
  { key: "critical", label: "Críticos" },
  { key: "occurrence", label: "Ocorrências", categories: ["occurrence", "region", "staffing"] },
  { key: "equipment", label: "Equipamentos", categories: ["equipment", "telemetry"] },
  { key: "anomaly", label: "Anomalias", categories: ["anomaly"] },
  { key: "maintenance", label: "Manutenção", categories: ["maintenance"] },
];

const VISIBLE_LIMIT = 60;
const FRESH_MS = 6_000;

export function matchesAlertFilter(alert: Alert, key: AlertFilterKey): boolean {
  if (key === "all") {
    return true;
  }
  if (key === "critical") {
    return alert.level === "critical";
  }
  return FILTERS.find((item) => item.key === key)?.categories?.includes(alert.category) ?? false;
}

export function isFreshAlert(alert: Alert, generatedAt: string): boolean {
  return (
    alert.level === "critical" &&
    !alert.acknowledged &&
    Date.parse(alert.since) >= Date.parse(generatedAt) - FRESH_MS
  );
}

export type AlertGroup = { key: string; title: string; level: Alert["level"]; items: Alert[] };

const GROUP_TITLES: Record<string, string> = {
  "maintenance-overdue": "Manutenções vencidas",
  "maintenance-soon": "Manutenções nos próximos 7 dias",
  "maintenance-immediate": "Manutenções imediatas solicitadas",
  "telemetry-silent": "Equipamentos sem comunicação",
};

const LEVEL_RANK: Record<Alert["level"], number> = { critical: 0, warning: 1, info: 2 };

function groupKey(alert: Alert): string | null {
  if (!["equipment", "telemetry", "maintenance"].includes(alert.category)) {
    return null;
  }
  const prefix = alert.id.replace(/-\d+$/, "");
  return alert.category === "equipment"
    ? `${prefix}|${alert.title}|${alert.acknowledged}`
    : `${prefix}|${alert.acknowledged}`;
}

export function groupAlerts(alerts: readonly Alert[]): (Alert | AlertGroup)[] {
  const groups = new Map<string, AlertGroup>();
  const entries: (Alert | AlertGroup)[] = [];
  for (const alert of alerts) {
    const key = groupKey(alert);
    const group = key === null ? undefined : groups.get(key);
    if (group) {
      group.items.push(alert);
      if (LEVEL_RANK[alert.level] < LEVEL_RANK[group.level]) {
        group.level = alert.level;
      }
    } else if (key !== null) {
      const created: AlertGroup = {
        key,
        title: GROUP_TITLES[alert.id.replace(/-\d+$/, "")] ?? alert.title,
        level: alert.level,
        items: [alert],
      };
      groups.set(key, created);
      entries.push(created);
    } else {
      entries.push(alert);
    }
  }
  return entries.map((entry) =>
    "items" in entry && entry.items.length === 1 ? entry.items[0]! : entry,
  );
}

type RowProps = {
  alert: Alert;
  grouped: boolean;
  now: number;
  generatedAt: string;
  onLocate: (alert: Alert) => void;
  pending: string | null;
  failed: string | null;
  onToggle: (alert: Alert) => void;
};

function AlertRow({
  alert,
  grouped,
  now,
  generatedAt,
  onLocate,
  pending,
  failed,
  onToggle,
}: RowProps) {
  const label = grouped ? alert.detail : alert.title;
  return (
    <li
      className={grouped ? "alert-group-item" : "alert"}
      data-level={alert.level}
      data-ack={alert.acknowledged}
      data-fresh={isFreshAlert(alert, generatedAt)}
    >
      {!grouped && (
        <div className="alert-head">
          <span className="alert-kind">
            {ALERT_LABELS[alert.level]} · {ALERT_CATEGORY_LABELS[alert.category]}
            {alert.acknowledged && ", reconhecido"}
          </span>
          <time dateTime={alert.since}>{formatRelative(alert.since, now)}</time>
        </div>
      )}
      {alert.lat === null ? (
        <span className="alert-title">{label}</span>
      ) : (
        <button type="button" className="alert-title alert-locate" onClick={() => onLocate(alert)}>
          {label}
        </button>
      )}
      {grouped ? (
        <time className="alert-detail" dateTime={alert.since}>
          {alert.title}, {formatRelative(alert.since, now)}
        </time>
      ) : (
        !alert.acknowledged && <span className="alert-detail">{alert.detail}</span>
      )}
      <button
        type="button"
        className="alert-ack"
        disabled={pending === alert.id}
        onClick={() => onToggle(alert)}
      >
        {alert.acknowledged ? "Reabrir" : "Reconhecer"}
      </button>
      {failed === alert.id && (
        <span className="alert-error" role="alert">
          Não foi possível salvar. Tente de novo.
        </span>
      )}
    </li>
  );
}

type Props = {
  alerts: Alert[];
  now: number;
  generatedAt: string;
  onLocate: (alert: Alert) => void;
};

export function AlertFeed({ alerts, now, generatedAt, onLocate }: Props) {
  const [filter, setFilter] = useState<AlertFilterKey>("all");
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const visible = alerts.filter((alert) => matchesAlertFilter(alert, filter));
  const critical = alerts.filter(
    (alert) => alert.level === "critical" && !alert.acknowledged,
  ).length;

  const toggleAck = async (alert: Alert) => {
    setPending(alert.id);
    setFailed(null);
    try {
      const path = `/alerts/${encodeURIComponent(alert.id)}/ack`;
      await (alert.acknowledged ? api.delete(path) : api.post(path));
    } catch {
      setFailed(alert.id);
    } finally {
      setPending(null);
    }
  };

  const rowProps = {
    now,
    generatedAt,
    onLocate,
    pending,
    failed,
    onToggle: (alert: Alert) => void toggleAck(alert),
  };

  return (
    <section aria-label="Alertas">
      <div className="feed-head">
        <label htmlFor="alert-filter" className="visually-hidden">
          Mostrar alertas
        </label>
        <select
          id="alert-filter"
          className="input input-small"
          value={filter}
          onChange={(event) => setFilter(event.target.value as AlertFilterKey)}
        >
          {FILTERS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label} ({alerts.filter((alert) => matchesAlertFilter(alert, item.key)).length})
            </option>
          ))}
        </select>
        <small role="status">
          {critical} crítico{critical === 1 ? "" : "s"} sem reconhecimento
        </small>
      </div>
      {visible.length === 0 ? (
        <p className="empty">
          {alerts.length === 0
            ? "Nenhum alerta ativo."
            : "Nenhum alerta nesta categoria. Escolha outra categoria para ver os demais."}
        </p>
      ) : (
        <ul className="alert-list">
          {groupAlerts(visible.slice(0, VISIBLE_LIMIT)).map((entry) =>
            "items" in entry ? (
              <li key={entry.key} className="alert alert-group" data-level={entry.level}>
                <details>
                  <summary>
                    <span className="alert-head">
                      <span className="alert-kind">
                        {ALERT_LABELS[entry.level]} ·{" "}
                        {ALERT_CATEGORY_LABELS[entry.items[0]!.category]}
                        {entry.items[0]!.acknowledged && ", reconhecidos"}
                      </span>
                      <span className="alert-group-count">{entry.items.length}</span>
                    </span>
                    <span className="alert-title">{entry.title}</span>
                  </summary>
                  <ul className="alert-group-items">
                    {entry.items.map((alert) => (
                      <AlertRow key={alert.id} alert={alert} grouped {...rowProps} />
                    ))}
                  </ul>
                </details>
              </li>
            ) : (
              <AlertRow key={entry.id} alert={entry} grouped={false} {...rowProps} />
            ),
          )}
        </ul>
      )}
      {visible.length > VISIBLE_LIMIT && (
        <p className="hint" style={{ marginTop: 8 }}>
          Mostrando os {VISIBLE_LIMIT} alertas mais importantes de {visible.length}.
        </p>
      )}
    </section>
  );
}
