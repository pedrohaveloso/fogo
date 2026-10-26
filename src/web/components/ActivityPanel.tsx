import { useState } from "react";
import { plural } from "../../shared/text.ts";
import type { ActivityFeed, ActivityItem, ActivityKind } from "../../shared/types.ts";
import { formatRelative, formatTime } from "../format.ts";
import { useFetch } from "../useFetch.ts";
import { visitBaseline } from "../visit.ts";
import { InlineLoading } from "./LoadingNotice.tsx";
import { cityPath } from "../cityScope.ts";

const REFRESH_MS = 30_000;
const SHOWN = 30;

type Target = ActivityItem["target"];

function countKind(items: ActivityItem[], kind: ActivityKind): number {
  return items.filter((item) => item.kind === kind).length;
}

function sinceSummary(items: ActivityItem[]): string {
  const opened = countKind(items, "occurrence_opened");
  const resolved = countKind(items, "occurrence_resolved");
  const down = countKind(items, "equipment_down");
  const restored = countKind(items, "equipment_restored");
  const parts = [
    opened > 0 && `${opened} ${plural(opened, "ocorrência nova", "ocorrências novas")}`,
    resolved > 0 && `${resolved} ${plural(resolved, "resolvida", "resolvidas")}`,
    down > 0 && `${down} ${plural(down, "equipamento parou", "equipamentos pararam")}`,
    restored > 0 &&
      `${restored} ${plural(restored, "equipamento voltou", "equipamentos voltaram")} a operar`,
  ].filter((part): part is string => part !== false);
  return parts.length === 0 ? "Nada novo." : `${parts.join(", ")}.`;
}

export function ActivityPanel({ now, onOpen }: { now: number; onOpen: (target: Target) => void }) {
  const { data, error, reload } = useFetch<ActivityFeed>(cityPath("/activity"), REFRESH_MS);
  const [all, setAll] = useState(false);
  const baseline = visitBaseline();

  if (error && !data) {
    return <p className="error-box">{error}</p>;
  }
  if (!data) {
    return <InlineLoading label="Carregando..." onRetry={reload} />;
  }
  const sinceVisit =
    baseline === null ? null : data.items.filter((item) => Date.parse(item.at) > baseline);
  const shown = all ? data.items : data.items.slice(0, SHOWN);

  return (
    <div className="activity">
      {sinceVisit && baseline !== null && (
        <section aria-labelledby="since-title" className="activity-since">
          <h3 id="since-title" className="drawer-subtitle">
            Desde a sua última visita, {formatRelative(new Date(baseline).toISOString(), now)}
          </h3>
          <p>{sinceSummary(sinceVisit)}</p>
        </section>
      )}
      <h3 className="drawer-subtitle">Últimas 24 horas</h3>
      {data.items.length === 0 ? (
        <p className="hint">Nenhum registro nas últimas 24 horas.</p>
      ) : (
        <ol className="timeline activity-list">
          {shown.map((item) => (
            <li key={item.id} data-kind={item.kind}>
              <time dateTime={item.at}>{formatTime(item.at)}</time>
              <div>
                <button type="button" className="activity-open" onClick={() => onOpen(item.target)}>
                  {item.title}
                </button>
                <span className="cell-sub">{item.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!all && data.items.length > SHOWN && (
        <button type="button" className="button button-small" onClick={() => setAll(true)}>
          Mostrar todos os {data.items.length} registros
        </button>
      )}
    </div>
  );
}
