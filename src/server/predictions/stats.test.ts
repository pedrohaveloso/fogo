import { describe, expect, it } from "vitest";
import {
  clamp,
  linearRegression,
  mean,
  poissonQuantile,
  predictionHalfWidth,
  poissonTail,
  slopeTStatistic,
  standardDeviation,
} from "./stats.ts";

describe("stats", () => {
  it("computes mean and sample deviation, including empty and single inputs", () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4])).toBe(3);
    expect(standardDeviation([5])).toBe(0);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it("fits an exact line", () => {
    expect(linearRegression([1, 3, 5, 7])).toEqual({ slope: 2, intercept: 1 });
    expect(linearRegression([4])).toEqual({ slope: 0, intercept: 4 });
  });

  it("gives a large t statistic only to clear trends", () => {
    expect(Math.abs(slopeTStatistic([10, 11, 12, 13, 14, 15.1, 16, 17]))).toBeGreaterThan(20);
    expect(Math.abs(slopeTStatistic([5, 9, 4, 8, 5, 9, 4, 8]))).toBeLessThan(2);
    expect(slopeTStatistic([1, 2])).toBe(0);
  });

  it("computes Poisson tail probabilities", () => {
    expect(poissonTail(0, 3)).toBe(1);
    expect(poissonTail(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(poissonTail(10, 2)).toBeLessThan(0.0001);
    expect(poissonTail(2, 0)).toBe(0);
  });

  it("finds Poisson quantiles and clamps values", () => {
    expect(poissonQuantile(0, 0.9)).toBe(0);
    expect(poissonQuantile(0.05, 0.1)).toBe(0);
    expect(poissonQuantile(2, 0.1)).toBe(0);
    expect(poissonQuantile(2, 0.9)).toBe(4);
    expect(poissonQuantile(10, 0.5)).toBe(10);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("widens the prediction band with noise and with distance from the data", () => {
    const flat = [10, 10, 10, 10, 10];
    expect(predictionHalfWidth(flat, 0, 10, 6, 1.28)).toBe(0);
    const noisy = [9, 11, 9, 11, 9, 11];
    const { slope, intercept } = linearRegression(noisy);
    const near = predictionHalfWidth(noisy, slope, intercept, 6, 1.28);
    const far = predictionHalfWidth(noisy, slope, intercept, 30, 1.28);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(predictionHalfWidth([1, 2], 1, 1, 5, 1.28)).toBe(0);
  });
});
