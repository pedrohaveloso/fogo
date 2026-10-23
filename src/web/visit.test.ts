import { describe, expect, it } from "vitest";
import { VISIT_GAP_MS, resolveBaseline } from "./visit.ts";

const NOW = Date.parse("2026-10-23T15:00:00.000Z");

describe("resolveBaseline", () => {
  it("has no baseline on the first visit", () => {
    expect(resolveBaseline(null, NOW)).toBeNull();
  });

  it("keeps the baseline while the visit goes on, even across reloads", () => {
    const stored = { baseline: NOW - 5 * 3_600_000, lastSeen: NOW - 60_000 };
    expect(resolveBaseline(stored, NOW)).toBe(stored.baseline);
  });

  it("keeps a missing baseline during the first visit", () => {
    expect(resolveBaseline({ baseline: null, lastSeen: NOW - 1000 }, NOW)).toBeNull();
  });

  it("starts a new visit after a long absence, counting from when the user was last seen", () => {
    const lastSeen = NOW - VISIT_GAP_MS - 1;
    expect(resolveBaseline({ baseline: NOW - 99 * 3_600_000, lastSeen }, NOW)).toBe(lastSeen);
  });

  it("treats a gap of exactly the limit as the same visit", () => {
    const stored = { baseline: 123, lastSeen: NOW - VISIT_GAP_MS };
    expect(resolveBaseline(stored, NOW)).toBe(123);
  });
});
