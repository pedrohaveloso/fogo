import { describe, expect, it } from "vitest";
import { curlExample, locationUrl } from "./TagPanel.tsx";

describe("tag instructions", () => {
  it("points the device at its own location route", () => {
    expect(locationUrl("http://192.168.0.10:3210", "TAG-ABCD2345")).toBe(
      "http://192.168.0.10:3210/api/tags/TAG-ABCD2345/location",
    );
  });

  it("builds a curl call with the bearer token and a JSON reading", () => {
    const example = curlExample("http://x/api/tags/TAG-1/location", "segredo");
    expect(example).toContain("curl -X POST http://x/api/tags/TAG-1/location");
    expect(example).toContain('-H "Authorization: Bearer segredo"');
    expect(example).toContain('"lat": -22.2139');
  });
});
