import { describe, expect, it } from "vitest";
import { availabilityLevel } from "./colors.ts";

describe("availabilityLevel", () => {
  it("uses the same thresholds as the region health", () => {
    expect(availabilityLevel(100)).toBe("normal");
    expect(availabilityLevel(85)).toBe("normal");
    expect(availabilityLevel(84.9)).toBe("attention");
    expect(availabilityLevel(60)).toBe("attention");
    expect(availabilityLevel(59.9)).toBe("critical");
    expect(availabilityLevel(0)).toBe("critical");
  });
});
