import type { Kpis, OperationsSummary } from "../../shared/types.ts";
import { HEALTH_LABELS } from "../colors.ts";
import { formatInteger, formatTime } from "../format.ts";
import {
  showsUnavailableOnly,
  toggleUnavailable,
  toggleUrgentMaintenance,
  type EquipmentFilters,
} from "./OperationsFilters.tsx";

const NORMAL_TEXT = "Todas as regiões operam normalmente e nenhuma ocorrência espera equipe.";

type CountProps = {
  value: number;
  label: string;
  tone: string;
  filter?: { pressed: boolean; onToggle: () => void };
};

function Count({ value, label, tone, filter }: CountProps) {
  const content = (
    <>
      <span className="city-count-value">{formatInteger(value)}</span>
      <span className="city-count-label">{label}</span>
    </>
  );
  const toneValue = value > 0 ? tone : undefined;
  if (!filter) {
    return (
      <div className="city-count" data-tone={toneValue}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="city-count"
      data-tone={toneValue}
      aria-pressed={filter.pressed}
      title={filter.pressed ? "Mostrar todos no mapa" : "Mostrar só estes no mapa"}
      onClick={filter.onToggle}
    >
      {content}
    </button>
  );
}

export function CityStatus({
  cityName,
  city,
  kpis,
  waiting,
  filters,
  onFiltersChange,
}: {
  cityName: string;
  city: OperationsSummary["city"];
  kpis: Kpis;
  waiting: number;
  filters: EquipmentFilters;
  onFiltersChange: (filters: EquipmentFilters) => void;
}) {
  return (
    <section className="city-status" data-level={city.level} aria-labelledby="city-status-title">
      <div className="city-stage">
        <h2 id="city-status-title" className="city-stage-label">
          Situação de {cityName}
        </h2>
        <p className="city-stage-level" role="status">
          {HEALTH_LABELS[city.level]}
          {city.since && <span className="city-stage-since"> desde {formatTime(city.since)}</span>}
        </p>
        <p className="city-stage-reason">
          {city.reasons.length === 0 ? NORMAL_TEXT : `${city.reasons.join(". ")}.`}
        </p>
      </div>
      <div className="city-counts">
        <Count value={waiting} label="ocorrências sem equipe" tone="warning" />
        <Count
          value={kpis.unavailable}
          label="equipamentos parados"
          tone="critical"
          filter={{
            pressed: showsUnavailableOnly(filters),
            onToggle: () => onFiltersChange(toggleUnavailable(filters)),
          }}
        />
        <Count
          value={kpis.maintenanceUrgent}
          label="manutenções urgentes"
          tone="warning"
          filter={{
            pressed: filters.maintenance === "urgent",
            onToggle: () => onFiltersChange(toggleUrgentMaintenance(filters)),
          }}
        />
      </div>
    </section>
  );
}
