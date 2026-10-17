import type { AreaHealth } from "../../shared/types.ts";
import { formatPercent } from "../format.ts";
import { HealthTag } from "./badges.tsx";

type Props = {
  regions: AreaHealth[];
  neighborhoods: AreaHealth[];
  selectedRegion: string;
  onSelectRegion: (id: string) => void;
  onSelectNeighborhood: (id: string) => void;
};

const LEVEL_ORDER = { critical: 0, attention: 1, normal: 2 } as const;

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
        </h2>
        <ul className="region-list">
          {regions.map((region) => (
            <li key={region.id}>
              <button
                type="button"
                className="region"
                aria-pressed={selectedRegion === region.id}
                onClick={() => onSelectRegion(selectedRegion === region.id ? "" : region.id)}
              >
                <span className="region-name">{region.name}</span>
                <span />
                <HealthTag level={region.level} />
                <span className="region-meta">
                  {formatPercent(region.availabilityPct)} disponível, {region.openOccurrences}{" "}
                  ocorrência
                  {region.openOccurrences === 1 ? "" : "s"}, {region.agentsActive} agente
                  {region.agentsActive === 1 ? "" : "s"} na área
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
                  onClick={() => onSelectNeighborhood(item.id)}
                >
                  <span className="region-name">{item.name}</span>
                  <span />
                  <HealthTag level={item.level} />
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
