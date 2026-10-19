import { describe, expect, it } from "vitest";
import { formatDate, formatHour, formatPercent, formatRelative, formatSigned } from "./format.ts";

describe("format", () => {
  const now = Date.parse("2026-10-14T15:00:00.000Z");

  it("describes elapsed time", () => {
    expect(formatRelative(null, now)).toBe("sem registro");
    expect(formatRelative("2026-10-14T14:59:30.000Z", now)).toBe("agora há pouco");
    expect(formatRelative("2026-10-14T14:45:00.000Z", now)).toBe("há 15 min");
    expect(formatRelative("2026-10-14T10:00:00.000Z", now)).toBe("há 5 h");
    expect(formatRelative("2026-10-10T15:00:00.000Z", now)).toBe("há 4 dias");
    expect(formatRelative("2026-10-14T15:01:00.000Z", now)).toBe("agora há pouco");
  });

  it("formats dates, hours and percentages in Brazilian style", () => {
    expect(formatDate("2026-10-14")).toBe("14/10/2026");
    expect(formatDate(null)).toBe("—");
    expect(formatHour(7)).toBe("07h");
    expect(formatPercent(92.345, 1)).toBe("92,3%");
  });

  it("signs balances with a true minus sign", () => {
    expect(formatSigned(4)).toBe("+4");
    expect(formatSigned(-3)).toBe("−3");
    expect(formatSigned(0)).toBe("0");
    expect(formatSigned(1200)).toBe("+1.200");
  });
});
