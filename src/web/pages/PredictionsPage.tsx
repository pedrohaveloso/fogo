import { useState, type ReactNode } from "react";
import { EQUIPMENT_TYPES, OCCURRENCE_KINDS, regionWith } from "../../shared/catalog.ts";
import { localParts } from "../../shared/time.ts";
import type {
  Anomaly,
  BacktestResult,
  FailureRiskReport,
  RiskForecast,
  StaffingPlan,
  TrendReport,
  TrendSeries,
} from "../../shared/types.ts";
import { RISK_COLORS } from "../colors.ts";
import { RiskTag } from "../components/badges.tsx";
import { LineChart } from "../components/charts/LineChart.tsx";
import { WeekHeatmap } from "../components/charts/WeekHeatmap.tsx";
import {
  formatCompact,
  formatDecimal,
  formatHour,
  formatInteger,
  formatPercent,
  formatShortDate,
} from "../format.ts";
import { Glyph, TYPE_GLYPHS } from "../icons.tsx";
import { useMeta } from "../live.ts";
import { RiskMap } from "../map/RiskMap.tsx";
import { useFetch } from "../useFetch.ts";
import { useNow } from "../useNow.ts";

const HORIZONS = [2, 4, 6, 8, 12, 24];
const REGION_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];

function Explain({ what, data, use }: { what: ReactNode; data: ReactNode; use: ReactNode }) {
  return (
    <details className="explain">
      <summary>Como esta previsão funciona</summary>
      <dl>
        <dt>O que é previsto</dt>
        <dd>{what}</dd>
        <dt>Dados usados</dt>
        <dd>{data}</dd>
        <dt>Como usar na decisão</dt>
        <dd>{use}</dd>
      </dl>
    </details>
  );
}

function Loading({ error }: { error: string | null }) {
  return error ? <p className="error-box">{error}</p> : <p className="hint">Calculando...</p>;
}

function RiskSection({ hours }: { hours: number }) {
  const meta = useMeta();
  const { data, error } = useFetch<RiskForecast>(`/predictions/risk?hours=${hours}`, 60_000);
  const [selected, setSelected] = useState<string | null>(null);
  if (!data || !meta) {
    return <Loading error={error} />;
  }
  const top = data.neighborhoods.slice(0, 12);
  const selectedRisk = data.neighborhoods.find((item) => item.neighborhoodId === selected);
  const regionName = (id: string) => meta.regions.find((region) => region.id === id)?.name ?? id;
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const item of data.neighborhoods) {
    counts[item.level] += 1;
  }

  return (
    <section className="panel" aria-labelledby="risk-title">
      <div className="panel-head">
        <h2 id="risk-title">Risco por bairro nas próximas {hours} horas</h2>
        <p>
          {counts.critical} crítico(s), {counts.high} alto(s), {counts.moderate} moderado(s)
        </p>
      </div>
      <div className="grid-2">
        <div>
          <RiskMap
            meta={meta}
            risks={data.neighborhoods}
            selected={selected}
            onSelect={setSelected}
          />
          <div className="legend" style={{ marginTop: 8 }}>
            {(["critical", "high", "moderate", "low"] as const).map((level) => (
              <RiskTag key={level} level={level} />
            ))}
          </div>
          {selectedRisk && (
            <div className="panel" style={{ marginTop: 10, background: "var(--surface-2)" }}>
              <h3>{selectedRisk.name}</h3>
              <p className="hint">
                {regionName(selectedRisk.regionId)}, índice {Math.round(selectedRisk.score)} de 100
              </p>
              <p style={{ marginTop: 6 }}>
                {formatDecimal(selectedRisk.expected)} ocorrência(s) esperada(s) até as{" "}
                {formatHour((data.startHour + hours) % 24)}, com pico às{" "}
                {formatHour(selectedRisk.peakHour)}. Mais prováveis:{" "}
                {selectedRisk.topKinds
                  .map((item) => OCCURRENCE_KINDS[item.kind].label.toLowerCase())
                  .join(", ")}
                .
              </p>
              {selectedRisk.coveragePenalty > 0 && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Câmeras, radares ou semáforos fora de operação no bairro aumentam o índice em{" "}
                  {formatPercent(selectedRisk.coveragePenalty * 100)}.
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <h3 className="section-title">
            Bairros com maior risco
            <small>índice de 0 a 100</small>
          </h3>
          <ol className="risk-list">
            {top.map((item, index) => (
              <li key={item.neighborhoodId}>
                <button
                  type="button"
                  className="risk-row row-button"
                  style={{ width: "100%", fontWeight: 400 }}
                  aria-pressed={selected === item.neighborhoodId}
                  onClick={() => setSelected(item.neighborhoodId)}
                >
                  <span className="hint">{index + 1}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <span className="hint" style={{ display: "block" }}>
                      {OCCURRENCE_KINDS[item.topKinds[0]!.kind].label}, pico às{" "}
                      {formatHour(item.peakHour)}
                      {item.trendPct >= 25
                        ? `, tendência de alta (+${Math.round(item.trendPct)}%)`
                        : ""}
                    </span>
                  </span>
                  <span className="meter" aria-hidden="true">
                    <span
                      style={{
                        width: `${item.score}%`,
                        background:
                          RISK_COLORS[item.level] === RISK_COLORS.low
                            ? "#6b7079"
                            : RISK_COLORS[item.level],
                      }}
                    />
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <strong>{Math.round(item.score)}</strong>
                    <span style={{ display: "block" }}>
                      <RiskTag level={item.level} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Explain
        what={`A chance de ocorrências (acidentes, congestionamentos, semáforos apagados, ocorrências de segurança etc.) em cada bairro nas próximas ${hours} horas, pesada pela gravidade típica de cada tipo. O índice compara o bairro neste horário com todos os bairros em todos os horários da semana: 95 ou mais significa que o momento está entre os 5% mais arriscados.`}
        data="As ocorrências dos últimos 4 meses. O modelo combina a participação de cada bairro em cada tipo de ocorrência, o padrão da cidade por dia da semana e hora, e a tendência das últimas duas semanas comparada às dez anteriores. Equipamentos de vigilância e fiscalização parados no bairro aumentam o índice, porque reduzem a capacidade de detectar e coibir problemas."
        use="Posicione viaturas e agentes nos bairros críticos antes do pico indicado, priorize o reparo de câmeras e semáforos nesses bairros e use a tendência de alta para planejar operações específicas."
      />
    </section>
  );
}

function WeeklySection() {
  const { data, error } = useFetch<RiskForecast>("/predictions/risk?hours=6", 300_000);
  const now = useNow(60_000);
  if (!data) {
    return <Loading error={error} />;
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
        what="O número médio de ocorrências esperado em cada hora de cada dia da semana, somando toda a cidade. O contorno amarelo marca o horário atual."
        data="As ocorrências das últimas 12 semanas, com peso maior para as semanas mais recentes e suavização entre horas vizinhas."
        use="Ajuste as escalas de turno aos picos (por exemplo, reforço no fim da tarde dos dias úteis e nas madrugadas de sexta e sábado) e programe manutenções nos horários de menor movimento."
      />
    </section>
  );
}

function StaffingSection({ hours }: { hours: number }) {
  const meta = useMeta();
  const { data, error } = useFetch<StaffingPlan>(`/predictions/staffing?hours=${hours}`, 30_000);
  if (!data || !meta) {
    return <Loading error={error} />;
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
                <td className="num" style={{ color: region.gap > 0 ? "#ff9d9d" : undefined }}>
                  {region.activeAgents}
                </td>
                <td>{region.peakWindow}</td>
                <td>{region.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.moves.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3 className="section-title">Remanejamento sugerido</h3>
          <ul className="insights">
            {data.moves.map((move) => (
              <li key={`${move.fromRegionId}-${move.toRegionId}`}>
                Deslocar {move.agents} agente(s) {regionWith("de", regionName(move.fromRegionId))}{" "}
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
  const { data, error } = useFetch<Anomaly[]>("/predictions/anomalies", 15_000);
  if (!data || !meta) {
    return <Loading error={error} />;
  }
  return (
    <section className="panel" aria-labelledby="anomalies-title">
      <div className="panel-head">
        <h2 id="anomalies-title">Comportamentos fora do padrão</h2>
        <p>Atualizado a cada 15 segundos</p>
      </div>
      {data.length === 0 ? (
        <p className="empty">
          Nenhum comportamento fora do padrão agora. Os sensores e as ocorrências estão dentro do
          esperado para o horário.
        </p>
      ) : (
        <ul className="alert-list">
          {data.map((anomaly) => (
            <li
              key={anomaly.id}
              className="alert"
              data-level={
                anomaly.kind === "occurrence_spike" || anomaly.kind === "silent_device"
                  ? "critical"
                  : "warning"
              }
            >
              <span className="alert-title">{anomaly.title}</span>
              <span className="alert-detail">{anomaly.detail}</span>
              <span className="alert-meta">
                {meta.neighborhoods.find((item) => item.id === anomaly.neighborhoodId)?.name},
                desvio de {formatDecimal(anomaly.score)}{" "}
                {anomaly.kind === "occurrence_spike"
                  ? "(escala logarítmica da improbabilidade)"
                  : "desvios-padrão"}
              </span>
            </li>
          ))}
        </ul>
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
  const { data, error } = useFetch<FailureRiskReport>("/predictions/failures", 120_000);
  if (!data || !meta) {
    return <Loading error={error} />;
  }
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
              <th scope="col" className="num">
                Chance de falha
              </th>
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
                      <span className="hint" style={{ display: "block" }}>
                        {EQUIPMENT_TYPES[item.type].label}
                      </span>
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
                <td className="num">
                  <strong>{formatPercent(item.probability7d * 100)}</strong>
                </td>
                <td>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      color: "var(--ink-2)",
                      fontSize: "0.86rem",
                    }}
                  >
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

function TrendChart({ series, unit }: { series: TrendSeries; unit: "percent" | "count" }) {
  const values = [...series.values, ...series.projection.map((item) => item.value)];
  const labels = [...series.days, ...series.projection.map((item) => item.day)].map(
    formatShortDate,
  );
  return (
    <LineChart
      title={series.label}
      description="Linha contínua: histórico. Linha tracejada: projeção pela tendência das últimas semanas."
      series={[
        {
          key: series.key,
          label: series.label,
          color: "#3987e5",
          values,
          projectedFrom: series.values.length - 1,
        },
      ]}
      xLabels={labels}
      yFormat={(value) => (unit === "percent" ? formatPercent(value) : formatCompact(value))}
      yMin={unit === "percent" ? Math.max(0, Math.floor(Math.min(...values) / 10) * 10) : 0}
      yMax={unit === "percent" ? 100 : undefined}
    />
  );
}

function TrendSection() {
  const { data, error } = useFetch<TrendReport>("/predictions/trends", 120_000);
  const [availabilityKey, setAvailabilityKey] = useState("all");
  if (!data) {
    return <Loading error={error} />;
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
        <div style={{ marginBottom: 16 }}>
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
          <h3 className="section-title">Disponibilidade dos equipamentos</h3>
          <fieldset className="tabs" style={{ marginBottom: 10 }}>
            <legend className="visually-hidden">Tipo de equipamento</legend>
            {data.availability.map((series) => (
              <button
                key={series.key}
                type="button"
                aria-pressed={series.key === availability?.key}
                onClick={() => setAvailabilityKey(series.key)}
              >
                {series.key === "all" ? "Todos" : series.label}
              </button>
            ))}
          </fieldset>
          {availability && <TrendChart series={availability} unit="percent" />}
          {availability && (
            <p className="hint">
              Variação de {availability.slopePerWeek >= 0 ? "+" : ""}
              {formatDecimal(availability.slopePerWeek)} ponto(s) percentual(is) por semana nas
              últimas 8 semanas.
            </p>
          )}
        </div>
        <div>
          <h3 className="section-title">Ocorrências por semana e região</h3>
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
        <div style={{ marginTop: 18 }}>
          <h3 className="section-title">Utilização dos equipamentos nas últimas 4 semanas</h3>
          <div className="grid-3">
            {data.usage.map((series) => (
              <div key={series.key}>
                <p style={{ fontWeight: 600 }}>{series.label}</p>
                <p className="hint">{usageTrend(series)}</p>
                <TrendChart series={series} unit="count" />
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

function BacktestSection() {
  const { data, error } = useFetch<BacktestResult>("/predictions/backtest");
  if (!data) {
    return <Loading error={error} />;
  }
  return (
    <section className="panel" aria-labelledby="backtest-title">
      <div className="panel-head">
        <h2 id="backtest-title">Quanto o modelo de risco acerta</h2>
        <p>Teste com os últimos {data.days} dias, sem que o modelo os tenha visto</p>
      </div>
      <div className="stat-row">
        <div>
          <div className="stat-value">{formatPercent(data.topHitRate)}</div>
          <p className="stat-label">
            das ocorrências caíram nos 10% de blocos de 4 horas que o modelo apontou como mais
            arriscados (a média histórica simples acertaria {formatPercent(data.baselineTopHitRate)}
            )
          </p>
        </div>
        <div>
          <div className="stat-value">{formatPercent(data.improvementPct)}</div>
          <p className="stat-label">
            menos erro que a média histórica simples ao prever quantas ocorrências cada região terá
            em cada bloco de 4 horas
          </p>
        </div>
        <div>
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
    </section>
  );
}

export function PredictionsPage() {
  const [hours, setHours] = useState(6);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Cidade preditiva</h1>
          <p>
            Previsões calculadas a partir do histórico de ocorrências, da telemetria dos
            equipamentos e do efetivo em serviço. Cada bloco explica o que está sendo previsto e com
            quais dados.
          </p>
        </div>
        <fieldset className="field chip-fieldset">
          <legend className="label">Horizonte da previsão</legend>
          <div className="tabs">
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
        </fieldset>
      </div>
      <RiskSection hours={hours} />
      <div className="grid-2">
        <WeeklySection />
        <AnomalySection />
      </div>
      <StaffingSection hours={hours} />
      <FailureSection />
      <TrendSection />
      <BacktestSection />
    </main>
  );
}
