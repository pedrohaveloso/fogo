import type { CityHealth, Kpis } from "../../shared/types.ts";
import { HEALTH_LABELS } from "../colors.ts";
import { formatInteger } from "../format.ts";

const NORMAL_TEXT = "Todas as regiões operam normalmente e nenhuma ocorrência espera equipe.";

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="city-count" data-tone={value > 0 ? tone : undefined}>
      <span className="city-count-value">{formatInteger(value)}</span>
      <span className="city-count-label">{label}</span>
    </div>
  );
}

export function CityStatus({
  city,
  kpis,
  waiting,
}: {
  city: CityHealth;
  kpis: Kpis;
  waiting: number;
}) {
  return (
    <section className="city-status" data-level={city.level} aria-labelledby="city-status-title">
      <div className="city-stage">
        <h2 id="city-status-title" className="city-stage-label">
          Situação de Marília
        </h2>
        <p className="city-stage-level" role="status">
          {HEALTH_LABELS[city.level]}
        </p>
        <p className="city-stage-reason">
          {city.reasons.length === 0 ? NORMAL_TEXT : `${city.reasons.join(". ")}.`}
        </p>
      </div>
      <div className="city-counts">
        <Count value={waiting} label="ocorrências sem equipe" tone="warning" />
        <Count value={kpis.unavailable} label="equipamentos parados" tone="critical" />
        <Count
          value={kpis.maintenanceImmediate + kpis.maintenanceOverdue}
          label="manutenções urgentes"
          tone="warning"
        />
      </div>
    </section>
  );
}
