import { describe, expect, it } from "vitest";
import {
  clamp,
  linearRegression,
  mean,
  percentileRank,
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

  it("ranks values against a sorted reference", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(75);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([], 5)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
