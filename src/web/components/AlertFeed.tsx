import { useState } from "react";
import type { Alert, AlertCategory } from "../../shared/types.ts";
import { api } from "../api.ts";
import { ALERT_LABELS } from "../colors.ts";
import { formatRelative } from "../format.ts";

type FilterKey = "all" | "critical" | "equipment" | "occurrence" | "anomaly" | "maintenance";

const FILTERS: { key: FilterKey; label: string; categories?: AlertCategory[] }[] = [
  { key: "all", label: "Todos" },
  { key: "critical", label: "Críticos" },
  { key: "occurrence", label: "Ocorrências", categories: ["occurrence", "region", "staffing"] },
  { key: "equipment", label: "Equipamentos", categories: ["equipment", "telemetry"] },
  { key: "anomaly", label: "Anomalias", categories: ["anomaly"] },
  { key: "maintenance", label: "Manutenção", categories: ["maintenance"] },
];

const VISIBLE_LIMIT = 60;

type Props = {
  alerts: Alert[];
  now: number;
  onLocate: (alert: Alert) => void;
};

export function AlertFeed({ alerts, now, onLocate }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pending, setPending] = useState<string | null>(null);
  const definition = FILTERS.find((item) => item.key === filter)!;
  const visible = alerts.filter((alert) =>
    filter === "all"
      ? true
      : filter === "critical"
        ? alert.level === "critical"
        : (definition.categories ?? []).includes(alert.category),
  );
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
    <section aria-labelledby="alerts-title">
      <h2 id="alerts-title" className="section-title">
        Alertas
        <small>
          {critical} crítico{critical === 1 ? "" : "s"} sem reconhecimento
        </small>
      </h2>
      <fieldset className="tabs" style={{ marginBottom: 10 }}>
        <legend className="visually-hidden">Filtrar alertas</legend>
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </fieldset>
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
            >
              <span className="alert-title">{alert.title}</span>
              <span className="alert-detail">{alert.detail}</span>
              <div className="alert-meta">
                <span>
                  {ALERT_LABELS[alert.level]}, {formatRelative(alert.since, now)}
                </span>
                <span className="alert-actions">
                  {alert.lat !== null && (
                    <button
                      type="button"
                      className="button button-small button-ghost"
                      onClick={() => onLocate(alert)}
                    >
                      Ver no mapa
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-small"
                    disabled={pending === alert.id}
                    onClick={() => void toggleAck(alert)}
                  >
                    {alert.acknowledged ? "Reabrir" : "Reconhecer"}
                  </button>
                </span>
              </div>
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
