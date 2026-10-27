import { describe, expect, it } from "vitest";
import { keptOperationsCity } from "./keptOperations.ts";

describe("keptOperationsCity", () => {
  it("keeps nothing before the central is opened", () => {
    expect(keptOperationsCity(null, "/equipment", 1)).toBeNull();
  });

  it("starts keeping the central once it is opened", () => {
    expect(keptOperationsCity(null, "/", 1)).toBe(1);
  });

  it("keeps the central while the user visits other pages of the same city", () => {
    expect(keptOperationsCity(1, "/equipment", 1)).toBe(1);
    expect(keptOperationsCity(1, "/agents/3", 1)).toBe(1);
  });

  it("drops the central of the previous city after a city change", () => {
    expect(keptOperationsCity(1, "/equipment", 2)).toBeNull();
    expect(keptOperationsCity(1, "/", 2)).toBe(2);
  });

  it("keeps nothing without a city", () => {
    expect(keptOperationsCity(1, "/", null)).toBeNull();
    expect(keptOperationsCity(null, "/equipment", null)).toBeNull();
  });
});
