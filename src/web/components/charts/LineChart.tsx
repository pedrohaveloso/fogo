import { useId, useState, type PointerEvent } from "react";
import { useElementWidth } from "../../useElementWidth.ts";
import { labelPositions, niceTicks } from "./scale.ts";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  projectedFrom?: number;
  band?: { from: number; low: number[]; high: number[] };
};

type Props = {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  yFormat: (value: number) => string;
  yMin?: number | undefined;
  yMax?: number | undefined;
  title: string;
  description?: string;
};

const PAD = { top: 12, right: 14, bottom: 26, left: 46 };
const LABEL_SPACING = 64;
const SURFACE = "#1f2328";

function linePath(points: [number, number][]): string {
  return points
    .map(([px, py], index) => `${index === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`)
    .join("");
}

export function LineChart({
  series,
  xLabels,
  height = 220,
  yFormat,
  yMin,
  yMax,
  title,
  description,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [box, width] = useElementWidth<HTMLDivElement>(640);
  const titleId = useId();
  const values = series.flatMap((item) => [
    ...item.values.filter((value): value is number => value !== null),
    ...(item.band?.low ?? []),
    ...(item.band?.high ?? []),
  ]);
  const low = yMin ?? Math.min(...values, 0);
  const rawHigh = yMax ?? Math.max(...values, 1);
  const high = rawHigh === low ? low + 1 : rawHigh;
  const ticks = niceTicks(low, high);
  const top = Math.max(high, ticks.at(-1) ?? high);
  const innerWidth = Math.max(40, width - PAD.left - PAD.right);
  const innerHeight = height - PAD.top - PAD.bottom;
  const count = xLabels.length;
  const x = (index: number) =>
    PAD.left + (count <= 1 ? innerWidth / 2 : (index / (count - 1)) * innerWidth);
  const y = (value: number) => PAD.top + innerHeight - ((value - low) / (top - low)) * innerHeight;
  const xTicks = labelPositions(count, innerWidth, LABEL_SPACING);

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
  };

  const tooltipLeft = hover === null ? 0 : x(hover);

  return (
    <figure style={{ margin: 0 }}>
      {series.length > 1 && (
        <div className="legend">
          {series.map((item) => (
            <span key={item.key}>
              <span className="legend-swatch" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div ref={box} className="chart-box">
        <svg
          className="chart"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{description ? `${title}. ${description}` : title}</title>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#2f353c"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end">
                {yFormat(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((position) => (
            <text
              key={position}
              x={x(position)}
              y={height - 6}
              textAnchor={position === 0 ? "start" : position === count - 1 ? "end" : "middle"}
            >
              {xLabels[position]}
            </text>
          ))}
          {series.map((item) => {
            const points = item.values
              .map((value, index): [number, number] | null =>
                value === null ? null : [x(index), y(value)],
              )
              .filter((value): value is [number, number] => value !== null);
            const split = item.projectedFrom ?? points.length;
            const solid = points.slice(0, split);
            const projected = points.slice(Math.max(0, split - 1));
            const last = solid.at(-1);
            const band = item.band;
            const bandPath = band
              ? `${linePath([
                  ...band.high.map((value, index): [number, number] => [
                    x(band.from + index),
                    y(value),
                  ]),
                  ...band.low
                    .map((value, index): [number, number] => [x(band.from + index), y(value)])
                    .toReversed(),
                ])}Z`
              : null;
            return (
              <g key={item.key}>
                {bandPath && <path d={bandPath} fill={item.color} opacity={0.14} stroke="none" />}
                <path
                  d={linePath(solid)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {item.projectedFrom !== undefined && projected.length > 1 && (
                  <path
                    d={linePath(projected)}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    opacity={0.8}
                  />
                )}
                {last && (
                  <circle
                    cx={last[0]}
                    cy={last[1]}
                    r={4}
                    fill={item.color}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                )}
              </g>
            );
          })}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerHeight}
              stroke="#959ca5"
              strokeWidth={1}
            />
          )}
          {hover !== null &&
            series.map((item) => {
              const value = item.values[hover];
              return value === null || value === undefined ? null : (
                <circle
                  key={item.key}
                  cx={x(hover)}
                  cy={y(value)}
                  r={4}
                  fill={item.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                />
              );
            })}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div
            className="chart-tooltip"
            style={{ left: Math.min(Math.max(tooltipLeft, 70), width - 70), top: 0 }}
          >
            <strong>{xLabels[hover]}</strong>
            {series.map((item) => {
              const value = item.values[hover];
              return value === null || value === undefined ? null : (
                <div key={item.key}>
                  {series.length > 1 ? `${item.label}: ` : ""}
                  {yFormat(value)}
                  {item.projectedFrom !== undefined && hover >= item.projectedFrom
                    ? " (projeção)"
                    : ""}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </figure>
  );
}
