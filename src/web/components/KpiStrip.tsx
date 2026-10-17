import type { Kpis } from "../../shared/types.ts";
import { formatInteger, formatPercent } from "../format.ts";

export function KpiStrip({ kpis }: { kpis: Kpis }) {
  const urgentMaintenance = kpis.maintenanceImmediate + kpis.maintenanceOverdue;
  return (
    <section className="kpi-strip" aria-label="Indicadores gerais">
      <div className="kpi">
        <div className="kpi-label">Equipamentos cadastrados</div>
        <div className="kpi-value">{formatInteger(kpis.equipmentTotal)}</div>
        <div className="kpi-note">
          {kpis.notInstalled} a instalar, {kpis.disabled} desativados
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Disponibilidade</div>
        <div className="kpi-value">{formatPercent(kpis.availabilityPct, 1)}</div>
        <div className="availability-bar" role="presentation">
          <span style={{ width: `${kpis.availabilityPct}%` }} />
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Operacionais</div>
        <div className="kpi-value">{formatInteger(kpis.operational)}</div>
        <div className="kpi-note">funcionando agora</div>
      </div>
      <div className="kpi" data-tone={kpis.unavailable > 0 ? "critical" : undefined}>
        <div className="kpi-label">Indisponíveis</div>
        <div className="kpi-value">{formatInteger(kpis.unavailable)}</div>
        <div className="kpi-note">falha, manutenção ou furto</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Agentes em atividade</div>
        <div className="kpi-value">{formatInteger(kpis.agentsActive)}</div>
        <div className="kpi-note">
          {kpis.agentsOnDuty} em serviço de {kpis.agentsTotal}
        </div>
      </div>
      <div className="kpi" data-tone={kpis.openOccurrences > 0 ? "warning" : undefined}>
        <div className="kpi-label">Ocorrências abertas</div>
        <div className="kpi-value">{formatInteger(kpis.openOccurrences)}</div>
        <div className="kpi-note">{kpis.criticalAlerts} alertas críticos</div>
      </div>
      <div className="kpi" data-tone={urgentMaintenance > 0 ? "warning" : undefined}>
        <div className="kpi-label">Manutenção urgente</div>
        <div className="kpi-value">{formatInteger(urgentMaintenance)}</div>
        <div className="kpi-note">{kpis.maintenanceDueSoon} previstas em 7 dias</div>
      </div>
    </section>
  );
}
