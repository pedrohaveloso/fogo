import { useId, useState } from "react";
import { WEEKDAY_LABELS } from "../../../shared/time.ts";
import { SEQUENTIAL_BLUE } from "../../colors.ts";
import { formatDecimal, formatHour } from "../../format.ts";

type Props = {
  matrix: number[][];
  current: { dow: number; hour: number };
  title: string;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const CELL_W = 24;
const CELL_H = 22;
const GAP = 2;
const LEFT = 36;
const TOP = 18;

function colorFor(value: number, max: number): string {
  if (max <= 0) {
    return SEQUENTIAL_BLUE[0]!;
  }
  const index = Math.min(
    SEQUENTIAL_BLUE.length - 1,
    Math.floor((value / max) * SEQUENTIAL_BLUE.length),
  );
  return SEQUENTIAL_BLUE[index]!;
}

export function WeekHeatmap({ matrix, current, title }: Props) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);
  const titleId = useId();
  const max = Math.max(...matrix.flat());
  const width = LEFT + 24 * (CELL_W + GAP);
  const height = TOP + 7 * (CELL_H + GAP) + 4;
  const shown = hover ?? current;
  const value = matrix[shown.dow]?.[shown.hour] ?? 0;

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ overflowX: "auto" }}>
        <svg
          className="chart"
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: 560 }}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{title}</title>
          {HOURS.filter((hour) => hour % 3 === 0).map((hour) => (
            <text
              key={hour}
              x={LEFT + hour * (CELL_W + GAP) + CELL_W / 2}
              y={12}
              textAnchor="middle"
            >
              {formatHour(hour)}
            </text>
          ))}
          {matrix.map((row, dow) => (
            <g key={WEEKDAY_LABELS[dow]}>
              <text x={LEFT - 6} y={TOP + dow * (CELL_H + GAP) + CELL_H / 2 + 4} textAnchor="end">
                {WEEKDAY_LABELS[dow]}
              </text>
              {HOURS.map((hour) => (
                <rect
                  key={hour}
                  className="heatmap-cell"
                  x={LEFT + hour * (CELL_W + GAP)}
                  y={TOP + dow * (CELL_H + GAP)}
                  width={CELL_W}
                  height={CELL_H}
                  rx={3}
                  fill={colorFor(row[hour] ?? 0, max)}
                  onPointerEnter={() => setHover({ dow, hour })}
                  onPointerLeave={() => setHover(null)}
                />
              ))}
            </g>
          ))}
          <rect
            x={LEFT + current.hour * (CELL_W + GAP) - 1.5}
            y={TOP + current.dow * (CELL_H + GAP) - 1.5}
            width={CELL_W + 3}
            height={CELL_H + 3}
            rx={4}
            fill="none"
            stroke="#ffc20e"
            strokeWidth={2}
            pointerEvents="none"
          />
        </svg>
      </div>
      <figcaption
        className="hint"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 6,
        }}
      >
        <span>
          {hover ? "" : "Agora: "}
          {WEEKDAY_LABELS[shown.dow]}, {formatHour(shown.hour)}: {formatDecimal(value)}{" "}
          ocorrência(s) por hora na cidade
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          menos
          {SEQUENTIAL_BLUE.map((color) => (
            <span
              key={color}
              style={{
                width: 14,
                height: 10,
                background: color,
                borderRadius: 2,
                display: "inline-block",
              }}
            />
          ))}
          mais
        </span>
      </figcaption>
    </figure>
  );
}
