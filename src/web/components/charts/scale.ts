export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) {
    return [min];
  }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

export function labelPositions(count: number, span: number, minSpacing: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [0];
  }
  const fit = Math.max(2, Math.floor(span / minSpacing));
  const stride = Math.max(1, Math.ceil((count - 1) / (fit - 1)));
  const positions: number[] = [];
  for (let position = 0; position < count; position += stride) {
    positions.push(position);
  }
  const last = positions.at(-1)!;
  if (last !== count - 1) {
    if ((count - 1 - last) * (span / (count - 1)) < minSpacing) {
      positions.pop();
    }
    positions.push(count - 1);
  }
  return positions;
}
