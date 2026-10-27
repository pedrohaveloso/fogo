import { useState, type ReactNode } from "react";
import { EQUIPMENT_TYPES, OCCURRENCE_KINDS, regionWith } from "../../shared/catalog.ts";
import { plural } from "../../shared/text.ts";
import { localParts } from "../../shared/time.ts";
import type {
  Anomaly,
  AnomalyKind,
  BacktestResult,
  FailureRiskReport,
  RiskForecast,
  RiskLevel,
  StaffingPlan,
  TrendReport,
  TrendSeries,
} from "../../shared/types.ts";
import { RISK_COLORS } from "../colors.ts";
import { LevelPlate, Meter, RiskTag } from "../components/badges.tsx";
import { LineChart } from "../components/charts/LineChart.tsx";
import { WeekHeatmap } from "../components/charts/WeekHeatmap.tsx";
import { Select } from "../components/Select.tsx";
import { InlineLoading } from "../components/LoadingNotice.tsx";
import { TabList, tabId, tabPanelId } from "../components/Tabs.tsx";
import {
  formatCompact,
  formatDecimal,
  formatHour,
  formatInteger,
  formatPercent,
  formatShortDate,
  formatSigned,
} from "../format.ts";
import { Glyph, TYPE_GLYPHS } from "../icons.tsx";
import { useMeta } from "../live.ts";
import { RiskMap } from "../map/RiskMap.tsx";
import { navigate, useLocation } from "../router.tsx";
import { useFetch } from "../useFetch.ts";
import { useNow } from "../useNow.ts";
import { cityPath } from "../cityScope.ts";

const HORIZONS = [2, 4, 6, 8, 12, 24];
const REGION_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const ANOMALY_PREVIEW = 6;
const MUTED_MARK = "#6b7079";

const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  flow_drop: "Queda de fluxo",
  flow_spike: "Pico de fluxo",
  silent_device: "Leitura zerada",
  occurrence_spike: "Concentração de ocorrências",
};

function anomalyLevel(anomaly: Anomaly): "critical" | "warning" {
  return anomaly.kind === "occurrence_spike" || anomaly.kind === "silent_device"
    ? "critical"
    : "warning";
}

function riskMark(level: RiskLevel): string {
  return level === "normal" ? MUTED_MARK : RISK_COLORS[level];
}

function Explain({ what, data, use }: { what: ReactNode; data: ReactNode; use: ReactNode }) {
  return (
    <div className="explain">
      <dl>
        <div>
          <dt>O que é previsto</dt>
          <dd>{what}</dd>
        </div>
        <div>
          <dt>Como usar na decisão</dt>
          <dd>{use}</dd>
        </div>
      </dl>
      <details className="disclosure">
        <summary>Dados usados no cálculo</summary>
        <p>{data}</p>
      </details>
    </div>
  );
}

function Loading({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return error ? (
    <div className="error-box">
      <p>{error}</p>
      <button type="button" className="button button-small" onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  ) : (
    <InlineLoading label="Calculando..." onRetry={onRetry} />
  );
}

function chanceText(probability: number): string {
  const inTen = Math.round(probability * 10);
  if (inTen >= 10) {
    return "quase certa";
  }
  return inTen < 1 ? "menos de 1 em 10" : `${inTen} em 10`;
}

function rangeText(range: [number, number], joiner = "a"): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]} ${joiner} ${range[1]}`;
}

function RiskSection({ hours }: { hours: number }) {
  const meta = useMeta();
  const { data, error, reload } = useFetch<RiskForecast>(
    cityPath(`/predictions/risk?hours=${hours}`),
    60_000,
  );
  const [selected, setSelected] = useState<string | null>(null);
  if (!data || !meta || data.horizonHours !== hours) {
    return <Loading error={error} onRetry={reload} />;
  }
  const top = data.neighborhoods.toSorted((a, b) => b.expected - a.expected).slice(0, 12);
  const highest = Math.max(...top.map((item) => item.expected), 0.1);
  const selectedRisk = data.neighborhoods.find((item) => item.neighborhoodId === selected);
  const regionName = (id: string) => meta.regions.find((region) => region.id === id)?.name ?? id;
  const wellAbove = data.neighborhoods.filter((item) => item.level === "well_above").length;
  const above = data.neighborhoods.filter((item) => item.level === "above").length;
  const until = formatHour((data.startHour + hours) % 24);

  return (
    <section className="panel" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title">Ocorrências esperadas por bairro nas próximas {hours} horas</h2>
        <p>
          {wellAbove + above === 0
            ? "Todos os bairros dentro do normal para este dia e horário"
            : `${wellAbove} ${plural(wellAbove, "bairro", "bairros")} muito acima do normal, ${above} acima`}
        </p>
      </div>
      <div className="risk-layout">
        <div className="risk-map-column">
          <RiskMap
            meta={meta}
            risks={data.neighborhoods}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="legend">
            {(["well_above", "above", "normal"] as const).map((level) => (
              <RiskTag key={level} level={level} />
            ))}
          </div>
          {selectedRisk && (
            <div className="risk-detail" role="status">
              <div className="risk-detail-head">
                <h3>{selectedRisk.name}</h3>
                <RiskTag level={selectedRisk.level} />
              </div>
              <p className="hint">{regionName(selectedRisk.regionId)}</p>
              <p>
                {formatDecimal(selectedRisk.expected)}{" "}
                {plural(selectedRisk.expected, "ocorrência esperada", "ocorrências esperadas")} até
                as {until}: em 8 de cada 10 dias parecidos, entre{" "}
                {rangeText(selectedRisk.range, "e")}. Chance de pelo menos uma:{" "}
                {chanceText(selectedRisk.chanceAny)}. Pico às {formatHour(selectedRisk.peakHour)}.
                Mais prováveis:{" "}
                {selectedRisk.topKinds
                  .map((item) => OCCURRENCE_KINDS[item.kind].label.toLowerCase())
                  .join(", ")}
                .
              </p>
              <p className="hint">
                {Math.abs(selectedRisk.ratio - 1) < 0.05
                  ? "Igual ao normal deste bairro para o dia da semana e o horário."
                  : `${formatPercent(Math.abs(selectedRisk.ratio - 1) * 100)} ${selectedRisk.ratio > 1 ? "acima" : "abaixo"} do normal deste bairro para o dia da semana e o horário.`}
                {selectedRisk.trendPct >= 5 &&
                  ` As duas últimas semanas tiveram ${formatPercent(selectedRisk.trendPct)} a mais que o habitual.`}
                {selectedRisk.coveragePenalty > 0 &&
                  ` Câmeras, radares ou semáforos parados no bairro somam ${formatPercent(selectedRisk.coveragePenalty * 100)}.`}
              </p>
            </div>
          )}
        </div>
        <div>
          <h3 className="section-title">
            Bairros com mais ocorrências esperadas
            <small>faixa de 8 em cada 10 dias</small>
          </h3>
          <ol className="risk-list">
            {top.map((item, index) => (
              <li key={item.neighborhoodId}>
                <button
                  type="button"
                  className="risk-row"
                  aria-pressed={selected === item.neighborhoodId}
                  onClick={() => setSelected(item.neighborhoodId)}
                >
                  <span className="risk-rank">{index + 1}</span>
                  <span>
                    <span className="risk-name">{item.name}</span>
                    <span className="cell-sub">
                      {OCCURRENCE_KINDS[item.topKinds[0]!.kind].label}, pico às{" "}
                      {formatHour(item.peakHour)}
                    </span>
                    {item.level !== "normal" && <RiskTag level={item.level} />}
                  </span>
                  <Meter value={item.expected} max={highest} color={riskMark(item.level)} />
                  <span className="risk-score">
                    <strong>{formatDecimal(item.expected)}</strong>
                    <span className="cell-sub">{rangeText(item.range)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Explain
        what={`Quantas ocorrências (acidentes, congestionamentos, semáforos apagados, ocorrências de segurança e outras) cada bairro deve ter nas próximas ${hours} horas, com a faixa em que o número cai em 8 de cada 10 dias parecidos. O mapa compara a previsão com o normal do próprio bairro para o mesmo dia da semana e horário: tracejado quando está 20% acima, zebrado quando está 50% acima.`}
        data="As ocorrências dos últimos 4 meses. O modelo combina a participação de cada bairro em cada tipo de ocorrência, o padrão da cidade por dia da semana e hora e a tendência das últimas duas semanas comparada às dez anteriores. Câmeras, radares e semáforos parados no bairro aumentam a previsão, porque reduzem a capacidade de detectar e coibir problemas. A faixa vem da distribuição de Poisson em torno do número esperado."
        use="Os bairros do topo da lista são onde mais coisa acontece agora; os marcados no mapa são onde está acontecendo mais do que o normal, e é ali que vale mudar a rotina: posicionar viaturas antes do pico, priorizar o conserto de câmeras e semáforos e investigar a causa da alta."
      />
    </section>
  );
}

function WeeklySection() {
  const { data, error, reload } = useFetch<RiskForecast>(
    cityPath("/predictions/risk?hours=6"),
    300_000,
  );
  const now = useNow(60_000);
  if (!data) {
    return <Loading error={error} onRetry={reload} />;
  }
  const { dow, hour } = localParts(now);
  return (
    <section className="panel" aria-labelledby="weekly-title">
      <div className="panel-head">
        <h2 id="weekly-title">Quando as ocorrências acontecem</h2>
        <p>Média por hora em toda a cidade</p>
      </div>
      <WeekHeatmap
        matrix={data.weeklyPattern}
        current={{ dow, hour }}
        title="Ocorrências esperadas por dia da semana e hora"
      />
      <Explain
        what="O número médio de ocorrências esperado em cada hora de cada dia da semana, somando toda a cidade. O contorno escuro marca o horário atual."
        data="As ocorrências das últimas 12 semanas, com peso maior para as semanas mais recentes e suavização entre horas vizinhas."
        use="Ajuste as escalas de turno aos picos (por exemplo, reforço no fim da tarde dos dias úteis e nas madrugadas de sexta e sábado) e programe manutenções nos horários de menor movimento."
      />
    </section>
  );
}

function StaffingSection({ hours }: { hours: number }) {
  const meta = useMeta();
  const { data, error, reload } = useFetch<StaffingPlan>(
    cityPath(`/predictions/staffing?hours=${hours}`),
    30_000,
  );
  if (!data || !meta) {
    return <Loading error={error} onRetry={reload} />;
  }
  const regionName = (id: string) => meta.regions.find((region) => region.id === id)?.name ?? id;
  return (
    <section className="panel" aria-labelledby="staffing-title">
      <div className="panel-head">
        <h2 id="staffing-title">Reforço de agentes nas próximas {hours} horas</h2>
        <p>Comparação entre a demanda prevista e o efetivo ativo de cada região</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Região</th>
              <th scope="col" className="num">
                Ocorrências previstas
              </th>
              <th scope="col" className="num">
                Horas de atendimento
              </th>
              <th scope="col" className="num">
                Agentes necessários
              </th>
              <th scope="col" className="num">
                Agentes ativos
              </th>
              <th scope="col" className="num">
                Saldo
              </th>
              <th scope="col">Pico</th>
              <th scope="col">Recomendação</th>
            </tr>
          </thead>
          <tbody>
            {data.regions.map((region) => (
              <tr key={region.regionId}>
                <td>
                  <strong>{region.regionName}</strong>
                </td>
                <td className="num">{formatDecimal(region.expectedOccurrences)}</td>
                <td className="num">{formatDecimal(region.workloadHours)}</td>
                <td className="num">{region.requiredAgents}</td>
                <td className="num">{region.activeAgents}</td>
                <td className="num">
                  <span
                    className="balance"
                    data-tone={region.gap > 0 ? "deficit" : region.gap < 0 ? "surplus" : undefined}
                  >
                    {formatSigned(-region.gap)}
                  </span>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{region.peakWindow}</td>
                <td>{region.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.moves.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 className="section-title">Remanejamento sugerido</h3>
          <ul className="insights">
            {data.moves.map((move) => (
              <li key={`${move.fromRegionId}-${move.toRegionId}`}>
                Deslocar {move.agents} {plural(move.agents, "agente", "agentes")}{" "}
                {regionWith("de", regionName(move.fromRegionId))}{" "}
                {regionWith("para", regionName(move.toRegionId))}.
              </li>
            ))}
          </ul>
        </div>
      )}
      <Explain
        what="Quantos agentes cada região precisa para absorver a demanda prevista, e quantos podem ser remanejados."
        data="A previsão de ocorrências por bairro, o tempo médio de atendimento de cada tipo de ocorrência e os agentes disponíveis ou em atendimento, agrupados pela região da base. O cálculo considera que um agente deve passar no máximo 40% do tempo em atendimento e distribui o efetivo em proporção ao risco ponderado pela gravidade."
        use="Antes da troca de turno ou do pico indicado, desloque agentes das regiões com folga para as regiões com déficit. Quando todas as regiões ficarem com déficit, o efetivo do turno é insuficiente e vale acionar reforço externo."
      />
    </section>
  );
}

function AnomalySection() {
  const meta = useMeta();
  const { data, error, reload } = useFetch<Anomaly[]>(cityPath("/predictions/anomalies"), 15_000);
  const [showAll, setShowAll] = useState(false);
  if (!data || !meta) {
    return <Loading error={error} onRetry={reload} />;
  }
  const ordered = data.toSorted(
    (a, b) =>
      Number(anomalyLevel(b) === "critical") - Number(anomalyLevel(a) === "critical") ||
      b.score - a.score,
  );
  const shown = showAll ? ordered : ordered.slice(0, ANOMALY_PREVIEW);
  return (
    <section className="panel" aria-labelledby="anomalies-title">
      <div className="panel-head">
        <h2 id="anomalies-title">Comportamentos fora do padrão</h2>
        <p>
          {data.length === 0
            ? "Atualizado a cada 15 segundos"
            : `${data.length} agora, atualizado a cada 15 segundos`}
        </p>
      </div>
      {data.length === 0 ? (
        <p className="empty">
          Nenhum comportamento fora do padrão agora. Os sensores e as ocorrências estão dentro do
          esperado para o horário.
        </p>
      ) : (
        <ul className="alert-list anomaly-grid">
          {shown.map((anomaly) => {
            const level = anomalyLevel(anomaly);
            return (
              <li key={anomaly.id} className="alert" data-level={level}>
                <div className="alert-head">
                  <span className="alert-kind">
                    <LevelPlate level={level} />
                    {ANOMALY_LABELS[anomaly.kind]}
                  </span>
                  <span>
                    {meta.neighborhoods.find((item) => item.id === anomaly.neighborhoodId)?.name}
                  </span>
                </div>
                <span className="alert-title">{anomaly.title}</span>
                <span className="alert-detail">{anomaly.detail}</span>
                <span className="alert-detail">
                  Desvio de {formatDecimal(anomaly.score)}{" "}
                  {anomaly.kind === "occurrence_spike"
                    ? "na escala logarítmica da improbabilidade"
                    : "desvios-padrão"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {data.length > ANOMALY_PREVIEW && (
        <button
          type="button"
          className="button button-small"
          style={{ marginTop: 12 }}
          aria-expanded={showAll}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? `Mostrar só as ${ANOMALY_PREVIEW} primeiras`
            : `Mostrar todas as ${data.length}`}
        </button>
      )}
      <Explain
        what="Sensores que pararam de contar, quedas ou picos de fluxo de veículos e concentrações de ocorrências que fogem do normal para o horário."
        data="A contagem de cada radar, câmera, semáforo, balança, totem e cancela na hora atual e na hora anterior, comparada ao mesmo horário das quatro semanas anteriores (escore z). Para ocorrências, o total da última hora em cada bairro é comparado ao esperado pelo modelo de risco com um teste de Poisson."
        use="Leitura zerada com o equipamento ainda online costuma indicar lente obstruída ou sensor travado: envie a equipe técnica. Queda ou pico de fluxo sugere bloqueio, desvio ou acidente próximo: confira as câmeras da região. Concentração de ocorrências pede reforço imediato no bairro."
      />
    </section>
  );
}

function FailureSection() {
  const meta = useMeta();
  const { data, error, reload } = useFetch<FailureRiskReport>(
    cityPath("/predictions/failures"),
    120_000,
  );
  if (!data || !meta) {
    return <Loading error={error} onRetry={reload} />;
  }
  const highest = Math.max(...data.items.map((item) => item.probability7d), 0.01);
  return (
    <section className="panel" aria-labelledby="failures-title">
      <div className="panel-head">
        <h2 id="failures-title">Equipamentos com maior risco de falha em 7 dias</h2>
        <p>
          No histórico, manutenção vencida multiplica o risco de falha por{" "}
          {formatDecimal(data.overdueHazardRatio)}
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Equipamento</th>
              <th scope="col">Bairro</th>
              <th scope="col">Chance de falha</th>
              <th scope="col">Por quê</th>
              <th scope="col">Recomendação</th>
            </tr>
          </thead>
          <tbody>
            {data.items.slice(0, 15).map((item) => (
              <tr key={item.equipmentId}>
                <td>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <Glyph d={TYPE_GLYPHS[item.type]} />
                    <span>
                      <strong>{item.serialNumber}</strong>
                      <span className="cell-sub">{EQUIPMENT_TYPES[item.type].label}</span>
                    </span>
                  </span>
                </td>
                <td>
                  {
                    meta.neighborhoods.find(
                      (neighborhood) => neighborhood.id === item.neighborhoodId,
                    )?.name
                  }
                </td>
                <td>
                  <span className="probability">
                    <strong>{formatPercent(item.probability7d * 100)}</strong>
                    <Meter value={item.probability7d} max={highest} color="#ec835a" />
                  </span>
                </td>
                <td>
                  <ul className="factor-list">
                    {item.factors.slice(0, 3).map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                </td>
                <td>{item.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explain
        what="A probabilidade de cada equipamento operacional apresentar falha nos próximos sete dias."
        data="O histórico de situação e de manutenções dos últimos 120 dias. Para cada tipo de equipamento, o sistema mede quantas falhas acontecem por dia de operação, quanto a manutenção vencida aumenta esse risco (comparando dias com a manutenção em dia e dias com ela vencida) e se as falhas do tipo estão crescendo no último mês."
        use="Monte a agenda da equipe técnica começando pelo topo da lista. Antecipar a preventiva de um equipamento com risco alto custa menos que o reparo corretivo e evita deixar o bairro sem cobertura."
      />
    </section>
  );
}

function usageTrend(series: TrendSeries): string {
  const average =
    series.values.reduce((sum, value) => sum + value, 0) / Math.max(series.values.length, 1);
  if (average === 0) {
    return "Sem uso registrado";
  }
  const weekly = (series.slopePerWeek / average) * 100;
  if (Math.abs(weekly) < 3) {
    return `Estável, cerca de ${formatCompact(average)} por dia`;
  }
  return `${weekly > 0 ? "Alta" : "Queda"} de ${formatDecimal(Math.abs(weekly))}% por semana, média de ${formatCompact(average)} por dia`;
}

function TrendChart({
  series,
  unit,
  height,
}: {
  series: TrendSeries;
  unit: "percent" | "count";
  height?: number;
}) {
  const values = [...series.values, ...series.projection.map((item) => item.value)];
  const labels = [...series.days, ...series.projection.map((item) => item.day)].map(
    formatShortDate,
  );
  return (
    <LineChart
      title={series.label}
      description="Linha contínua: histórico. Linha tracejada: projeção pela tendência das últimas semanas. Faixa clara: onde o valor deve ficar em 8 de cada 10 casos."
      series={[
        {
          key: series.key,
          label: series.label,
          color: "#3987e5",
          values,
          projectedFrom: series.values.length - 1,
          ...(series.projection.length > 0 && {
            band: {
              from: series.values.length - 1,
              low: [series.values.at(-1)!, ...series.projection.map((item) => item.low)],
              high: [series.values.at(-1)!, ...series.projection.map((item) => item.high)],
            },
          }),
        },
      ]}
      xLabels={labels}
      yFormat={(value) => (unit === "percent" ? formatPercent(value) : formatCompact(value))}
      yMin={unit === "percent" ? Math.max(0, Math.floor(Math.min(...values) / 10) * 10) : 0}
      yMax={unit === "percent" ? 100 : undefined}
      {...(height ? { height } : {})}
    />
  );
}

function TrendSection() {
  const { data, error, reload } = useFetch<TrendReport>(cityPath("/predictions/trends"), 120_000);
  const [availabilityKey, setAvailabilityKey] = useState("all");
  if (!data) {
    return <Loading error={error} onRetry={reload} />;
  }
  const availability =
    data.availability.find((item) => item.key === availabilityKey) ?? data.availability[0];
  const weeks = data.occurrences[0]?.days.map(formatShortDate) ?? [];
  return (
    <section className="panel" aria-labelledby="trends-title">
      <div className="panel-head">
        <h2 id="trends-title">Tendências</h2>
        <p>Histórico com projeção pela tendência recente</p>
      </div>
      {data.insights.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 className="section-title">O que mudou nas últimas semanas</h3>
          <ul className="insights">
            {data.insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid-2">
        <div>
          <div className="chart-head">
            <h3 className="section-title">Disponibilidade dos equipamentos</h3>
            <div className="field chart-select">
              <label htmlFor="availability-type" className="visually-hidden">
                Tipo de equipamento
              </label>
              <Select
                id="availability-type"
                size="sm"
                value={availability?.key ?? ""}
                options={data.availability.map((series) => ({
                  value: series.key,
                  label: series.key === "all" ? "Todos os tipos" : series.label,
                }))}
                onChange={setAvailabilityKey}
              />
            </div>
          </div>
          {availability && <TrendChart series={availability} unit="percent" />}
          {availability && (
            <p className="hint">
              Variação de {availability.slopePerWeek >= 0 ? "+" : ""}
              {formatDecimal(availability.slopePerWeek)}{" "}
              {plural(availability.slopePerWeek, "ponto percentual", "pontos percentuais")} por
              semana nas últimas 8 semanas. A faixa clara da projeção mostra onde a disponibilidade
              deve ficar em 8 de cada 10 casos.
            </p>
          )}
        </div>
        <div>
          <div className="chart-head">
            <h3 className="section-title">Ocorrências por semana e região</h3>
          </div>
          <LineChart
            title="Ocorrências por semana em cada região"
            series={data.occurrences.map((series, index) => ({
              key: series.key,
              label: series.label,
              color: REGION_COLORS[index % REGION_COLORS.length]!,
              values: series.values,
            }))}
            xLabels={weeks}
            yFormat={(value) => formatInteger(value)}
          />
        </div>
      </div>
      {data.usage.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="section-title">Utilização dos equipamentos nas últimas 4 semanas</h3>
          <div className="grid-3">
            {data.usage.map((series) => (
              <div key={series.key} className="small-multiple">
                <p className="small-multiple-title">{series.label}</p>
                <p className="hint">{usageTrend(series)}</p>
                <TrendChart series={series} unit="count" height={170} />
              </div>
            ))}
          </div>
        </div>
      )}
      <Explain
        what="Para onde caminham a disponibilidade dos equipamentos, o volume de ocorrências por região e o uso de totens, cancelas e dos sensores de fluxo."
        data="A situação diária de cada equipamento nos últimos 90 dias, as ocorrências semanais das últimas 12 semanas e as leituras de telemetria dos últimos 28 dias. A projeção é uma regressão linear sobre o período mais recente."
        use="Uma disponibilidade em queda indica que a frota precisa de renovação ou que o contrato de manutenção não está dando conta. Bairros com alta persistente de ocorrências pedem ação estrutural (sinalização, iluminação, fiscalização), além do reforço pontual."
      />
    </section>
  );
}

function ModelQuality() {
  const { data, error, reload } = useFetch<BacktestResult>(cityPath("/predictions/backtest"));
  if (!data) {
    return <Loading error={error} onRetry={reload} />;
  }
  const rateScale = Math.max(data.topHitRate, data.baselineTopHitRate, 1);
  return (
    <section className="model-quality" aria-labelledby="backtest-title">
      <h2 id="backtest-title" className="model-quality-title">
        Quanto o modelo de risco acerta
      </h2>
      <p>
        No teste com os últimos {data.days} dias, que o modelo não viu, os 10% de blocos de 4 horas
        apontados como mais arriscados concentraram {formatPercent(data.topHitRate)} das
        ocorrências. A média histórica simples concentrou {formatPercent(data.baselineTopHitRate)}.
      </p>
      <details className="disclosure">
        <summary>Ver o teste completo</summary>
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{formatPercent(data.topHitRate)}</div>
            <p className="stat-label">
              das ocorrências caíram nos 10% de blocos de 4 horas que o modelo apontou como mais
              arriscados
            </p>
            <div className="compare">
              <span>Modelo</span>
              <Meter value={data.topHitRate} max={rateScale} color="#3987e5" />
              <span>{formatPercent(data.topHitRate)}</span>
              <span>Média simples</span>
              <Meter value={data.baselineTopHitRate} max={rateScale} color={MUTED_MARK} />
              <span>{formatPercent(data.baselineTopHitRate)}</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatPercent(data.improvementPct)}</div>
            <p className="stat-label">
              menos erro que a média histórica simples ao prever quantas ocorrências cada região
              terá em cada bloco de 4 horas
            </p>
          </div>
          <div className="stat">
            <div className="stat-value">{formatDecimal(data.modelMae)}</div>
            <p className="stat-label">
              ocorrências de erro médio por região e bloco de 4 horas ({data.evaluatedCells} blocos
              avaliados)
            </p>
          </div>
        </div>
        <Explain
          what="A qualidade da previsão de risco, medida em dados que o modelo não usou para aprender."
          data="O modelo é treinado com tudo o que aconteceu até sete dias atrás e prevê os sete dias seguintes. A comparação é com a média histórica simples de cada região, que ignora dia da semana e horário."
          use="O índice de risco serve para priorizar onde e quando agir. Ele não diz onde cada ocorrência vai acontecer: ocorrências isoladas são, em grande parte, aleatórias."
        />
      </details>
    </section>
  );
}

const TABS = [
  {
    key: "next-hours",
    label: "Próximas horas",
  },
  {
    key: "anomalies",
    label: "Fora do padrão",
  },
  {
    key: "equipment",
    label: "Equipamentos",
  },
  {
    key: "trends",
    label: "Tendências",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export function PredictionsPage() {
  const [hours, setHours] = useState(6);
  const { params } = useLocation();
  const requested = params.get("tab");
  const tab = isTabKey(requested) ? requested : TABS[0].key;
  return (
    <main className="page">
      <div className="page-head">
        <h1>Cidade preditiva</h1>
      </div>
      <TabList
        items={TABS}
        selected={tab}
        onSelect={(key) => navigate(`/predictions?tab=${key}`, { replace: true })}
        label="Perguntas da cidade preditiva"
        idPrefix="predictions"
        className="page-tabs"
      />
      <div
        id={tabPanelId("predictions")}
        className="tab-panel"
        role="tabpanel"
        aria-labelledby={tabId("predictions", tab)}
      >
        {tab === "next-hours" && (
          <>
            <div className="horizon-bar">
              <span id="horizon-label" className="label">
                Horizonte da previsão
              </span>
              <div className="segmented" role="group" aria-labelledby="horizon-label">
                {HORIZONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={hours === value}
                    onClick={() => setHours(value)}
                  >
                    {value} h
                  </button>
                ))}
              </div>
              <span className="hint horizon-hint">
                Vale para o risco por bairro e o reforço de agentes.
              </span>
            </div>
            <RiskSection hours={hours} />
            <StaffingSection hours={hours} />
            <WeeklySection />
            <ModelQuality />
          </>
        )}
        {tab === "anomalies" && <AnomalySection />}
        {tab === "equipment" && <FailureSection />}
        {tab === "trends" && <TrendSection />}
      </div>
    </main>
  );
}
