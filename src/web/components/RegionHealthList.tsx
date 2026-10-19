import type { AreaHealth } from "../../shared/types.ts";
import { HEALTH_COLORS, availabilityLevel } from "../colors.ts";
import { formatPercent } from "../format.ts";
import { HealthTag, Meter } from "./badges.tsx";

type Props = {
  regions: AreaHealth[];
  neighborhoods: AreaHealth[];
  selectedRegion: string;
  onSelectRegion: (id: string) => void;
  onSelectNeighborhood: (id: string) => void;
};

const LEVEL_ORDER = { critical: 0, attention: 1, normal: 2 } as const;

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function RegionHealthList({
  regions,
  neighborhoods,
  selectedRegion,
  onSelectRegion,
  onSelectNeighborhood,
}: Props) {
  const flagged = neighborhoods
    .filter((item) => item.level !== "normal")
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.availabilityPct - b.availabilityPct,
    );

  return (
    <>
      <section aria-labelledby="regions-title">
        <h2 id="regions-title" className="section-title">
          Situação por região
          <small>selecione para filtrar</small>
        </h2>
        <ul className="region-list">
          {regions.map((region) => (
            <li key={region.id}>
              <button
                type="button"
                className="region"
                data-level={region.level}
                aria-pressed={selectedRegion === region.id}
                onClick={() => onSelectRegion(selectedRegion === region.id ? "" : region.id)}
              >
                <span className="region-top">
                  <span className="region-name">{region.name}</span>
                  <HealthTag level={region.level} />
                </span>
                <span className="region-availability">
                  <Meter
                    value={region.availabilityPct}
                    color={HEALTH_COLORS[availabilityLevel(region.availabilityPct)]}
                  />
                  <span>{formatPercent(region.availabilityPct)} disponível</span>
                </span>
                <span className="region-meta">
                  {plural(region.openOccurrences, "ocorrência aberta", "ocorrências abertas")},{" "}
                  {plural(region.agentsActive, "agente na área", "agentes na área")}
                </span>
                {region.reasons.length > 0 && (
                  <span className="region-meta">{region.reasons.join("; ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="flagged-title">
        <h2 id="flagged-title" className="section-title">
          Bairros que exigem atenção
          <small>{flagged.length}</small>
        </h2>
        {flagged.length === 0 ? (
          <p className="hint">Todos os bairros operam normalmente.</p>
        ) : (
          <ul className="region-list">
            {flagged.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="region"
                  data-level={item.level}
                  onClick={() => onSelectNeighborhood(item.id)}
                >
                  <span className="region-top">
                    <span className="region-name">{item.name}</span>
                    <HealthTag level={item.level} />
                  </span>
                  <span className="region-meta">{item.reasons.join("; ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
