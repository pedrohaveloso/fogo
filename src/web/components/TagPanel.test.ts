import { describe, expect, it } from "vitest";
import { locationUrl } from "./TagPanel.tsx";

describe("tag instructions", () => {
  it("points the device at its own location route", () => {
    expect(locationUrl("http://192.168.0.10:3210", "TAG-ABCD2345")).toBe(
      "http://192.168.0.10:3210/api/tags/TAG-ABCD2345/location",
    );
  });
});
