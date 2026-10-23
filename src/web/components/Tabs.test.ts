import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./Tabs.tsx";

describe("nextTabIndex", () => {
  it("moves with the arrows and wraps around both ends", () => {
    expect(nextTabIndex(0, 3, "ArrowRight")).toBe(1);
    expect(nextTabIndex(2, 3, "ArrowRight")).toBe(0);
    expect(nextTabIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(nextTabIndex(1, 3, "ArrowLeft")).toBe(0);
  });

  it("jumps to the first and last tab with Home and End", () => {
    expect(nextTabIndex(1, 4, "Home")).toBe(0);
    expect(nextTabIndex(1, 4, "End")).toBe(3);
  });

  it("ignores every other key", () => {
    expect(nextTabIndex(1, 3, "Enter")).toBeNull();
    expect(nextTabIndex(1, 3, "ArrowDown")).toBeNull();
  });
});
