import { plural } from "../../../shared/text.ts";
import { useId, useState } from "react";
import { WEEKDAY_LABELS } from "../../../shared/time.ts";
import { SEQUENTIAL_BLUE } from "../../colors.ts";
import { formatDecimal, formatHour } from "../../format.ts";
import { useElementWidth } from "../../useElementWidth.ts";

type Props = {
  matrix: number[][];
  current: { dow: number; hour: number };
  title: string;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const CELL_H = 22;
const GAP = 2;
const LEFT = 36;
const TOP = 18;
const MIN_CELL = 15;

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
  const [box, available] = useElementWidth<HTMLDivElement>(640);
  const titleId = useId();
  const max = Math.max(...matrix.flat());
  const cellW = Math.max(MIN_CELL, Math.floor((available - LEFT) / 24) - GAP);
  const width = LEFT + 24 * (cellW + GAP);
  const height = TOP + 7 * (CELL_H + GAP) + 4;
  const shown = hover ?? current;
  const value = matrix[shown.dow]?.[shown.hour] ?? 0;

  return (
    <figure style={{ margin: 0 }}>
      <div ref={box} className="heatmap-scroll">
        <svg
          className="chart"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width, maxWidth: "none" }}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{title}</title>
          {HOURS.filter((hour) => hour % 3 === 0).map((hour) => (
            <text key={hour} x={LEFT + hour * (cellW + GAP) + cellW / 2} y={12} textAnchor="middle">
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
                  x={LEFT + hour * (cellW + GAP)}
                  y={TOP + dow * (CELL_H + GAP)}
                  width={cellW}
                  height={CELL_H}
                  rx={2}
                  fill={colorFor(row[hour] ?? 0, max)}
                  onPointerEnter={() => setHover({ dow, hour })}
                  onPointerLeave={() => setHover(null)}
                />
              ))}
            </g>
          ))}
          <rect
            x={LEFT + current.hour * (cellW + GAP) - 1.5}
            y={TOP + current.dow * (CELL_H + GAP) - 1.5}
            width={cellW + 3}
            height={CELL_H + 3}
            rx={3.5}
            fill="none"
            stroke="#16191d"
            strokeWidth={2}
            pointerEvents="none"
          />
        </svg>
      </div>
      <figcaption className="hint heatmap-caption">
        <span>
          {hover ? "" : "Agora: "}
          {WEEKDAY_LABELS[shown.dow]}, {formatHour(shown.hour)}: {formatDecimal(value)}{" "}
          {plural(value, "ocorrência", "ocorrências")} por hora na cidade
        </span>
        <span className="heatmap-scale">
          menos
          {SEQUENTIAL_BLUE.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
          mais
        </span>
      </figcaption>
    </figure>
  );
}
