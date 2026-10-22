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

type Props = {
  alerts: Alert[];
  now: number;
  generatedAt: string;
  onLocate: (alert: Alert) => void;
};

export function AlertFeed({ alerts, now, generatedAt, onLocate }: Props) {
  const [filter, setFilter] = useState<AlertFilterKey>("all");
  const [pending, setPending] = useState<string | null>(null);
  const visible = alerts.filter((alert) => matchesAlertFilter(alert, filter));
  const critical = alerts.filter(
    (alert) => alert.level === "critical" && !alert.acknowledged,
  ).length;

  const toggleAck = async (alert: Alert) => {
    setPending(alert.id);
    try {
      const path = `/alerts/${encodeURIComponent(alert.id)}/ack`;
      await (alert.acknowledged ? api.delete(path) : api.post(path));
    } finally {
      setPending(null);
    }
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
        <small>
          {critical} crítico{critical === 1 ? "" : "s"} sem reconhecimento
        </small>
      </div>
      {visible.length === 0 ? (
        <p className="empty">
          Nenhum alerta nesta categoria. A cidade está operando dentro do esperado.
        </p>
      ) : (
        <ul className="alert-list" aria-live="polite" aria-relevant="additions">
          {visible.slice(0, VISIBLE_LIMIT).map((alert) => (
            <li
              key={alert.id}
              className="alert"
              data-level={alert.level}
              data-ack={alert.acknowledged}
              data-fresh={isFreshAlert(alert, generatedAt)}
            >
              <div className="alert-head">
                <span className="alert-kind">
                  {ALERT_LABELS[alert.level]} · {ALERT_CATEGORY_LABELS[alert.category]}
                  {alert.acknowledged && ", reconhecido"}
                </span>
                <time dateTime={alert.since}>{formatRelative(alert.since, now)}</time>
              </div>
              {alert.lat === null ? (
                <span className="alert-title">{alert.title}</span>
              ) : (
                <button
                  type="button"
                  className="alert-title alert-locate"
                  onClick={() => onLocate(alert)}
                >
                  {alert.title}
                </button>
              )}
              {!alert.acknowledged && <span className="alert-detail">{alert.detail}</span>}
              <button
                type="button"
                className="alert-ack"
                disabled={pending === alert.id}
                onClick={() => void toggleAck(alert)}
              >
                {alert.acknowledged ? "Reabrir" : "Reconhecer"}
              </button>
            </li>
          ))}
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
