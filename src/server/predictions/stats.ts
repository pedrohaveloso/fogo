export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const average = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}

export function linearRegression(values: readonly number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) {
    return { slope: 0, intercept: values[0] ?? 0 };
  }
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });
  const slope = numerator / denominator;
  return { slope, intercept: yMean - slope * xMean };
}

export function slopeTStatistic(values: readonly number[]): number {
  const n = values.length;
  if (n < 3) {
    return 0;
  }
  const { slope, intercept } = linearRegression(values);
  const xMean = (n - 1) / 2;
  let residual = 0;
  let spread = 0;
  values.forEach((value, index) => {
    residual += (value - (intercept + slope * index)) ** 2;
    spread += (index - xMean) ** 2;
  });
  const standardError = Math.sqrt(residual / (n - 2) / spread);
  return standardError === 0 ? 0 : slope / standardError;
}

export function poissonTail(observed: number, expected: number): number {
  if (observed <= 0) {
    return 1;
  }
  if (expected <= 0) {
    return 0;
  }
  let term = Math.exp(-expected);
  let cumulative = term;
  for (let k = 1; k < observed; k += 1) {
    term *= expected / k;
    cumulative += term;
  }
  return Math.max(0, 1 - cumulative);
}

export function percentileRank(sorted: readonly number[], value: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return (low / sorted.length) * 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
