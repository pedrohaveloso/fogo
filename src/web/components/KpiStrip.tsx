import type { ReactNode } from "react";
import type { Kpis } from "../../shared/types.ts";
import { HEALTH_COLORS, availabilityLevel } from "../colors.ts";
import { formatInteger, formatPercent } from "../format.ts";
import { Meter } from "./badges.tsx";

type Tone = "critical" | "warning" | undefined;

function Kpi({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className="kpi" data-tone={tone}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {children}
    </div>
  );
}

export function KpiStrip({ kpis, waiting }: { kpis: Kpis; waiting: number }) {
  const urgentMaintenance = kpis.maintenanceImmediate + kpis.maintenanceOverdue;
  const availability = availabilityLevel(kpis.availabilityPct);
  const availabilityTone: Tone =
    availability === "critical" ? "critical" : availability === "attention" ? "warning" : undefined;
  return (
    <section className="kpi-strip" aria-label="Indicadores gerais">
      <Kpi label="Equipamentos cadastrados" value={formatInteger(kpis.equipmentTotal)}>
        <div className="kpi-note">
          {kpis.notInstalled} a instalar, {kpis.disabled} desativados
        </div>
      </Kpi>
      <Kpi
        label="Disponibilidade"
        value={formatPercent(kpis.availabilityPct, 1)}
        tone={availabilityTone}
      >
        <Meter value={kpis.availabilityPct} color={HEALTH_COLORS[availability]} />
      </Kpi>
      <Kpi label="Operacionais" value={formatInteger(kpis.operational)}>
        <div className="kpi-note">funcionando agora</div>
      </Kpi>
      <Kpi
        label="Indisponíveis"
        value={formatInteger(kpis.unavailable)}
        tone={kpis.unavailable > 0 ? "critical" : undefined}
      >
        <div className="kpi-note">falha, manutenção ou furto</div>
      </Kpi>
      <Kpi label="Agentes em atividade" value={formatInteger(kpis.agentsActive)}>
        <div className="kpi-note">
          {kpis.agentsOnDuty} em serviço de {kpis.agentsTotal}
        </div>
      </Kpi>
      <Kpi
        label="Ocorrências abertas"
        value={formatInteger(kpis.openOccurrences)}
        tone={waiting > 0 ? "warning" : undefined}
      >
        <div className="kpi-note">
          {waiting === 0 ? "todas com equipe" : `${waiting} aguardando equipe`}
        </div>
      </Kpi>
      <Kpi
        label="Manutenção urgente"
        value={formatInteger(urgentMaintenance)}
        tone={urgentMaintenance > 0 ? "warning" : undefined}
      >
        <div className="kpi-note">{kpis.maintenanceDueSoon} previstas em 7 dias</div>
      </Kpi>
    </section>
  );
}
