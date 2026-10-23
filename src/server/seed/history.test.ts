import { describe, expect, it } from "vitest";
import { DAY } from "../../shared/time.ts";
import { createRandom } from "../random.ts";
import { NOW } from "../test-fixtures.ts";
import { simulateEquipmentHistory } from "./history.ts";

describe("simulateEquipmentHistory", () => {
  it("replaces stolen equipment one to three weeks after the theft", () => {
    const random = createRandom(7);
    const start = NOW - 3000 * DAY;
    const thefts: {
      stolenAt: number;
      next: { status: string; at: number; reason: string } | undefined;
    }[] = [];
    for (let unit = 0; unit < 40; unit += 1) {
      const { events } = simulateEquipmentHistory(
        random,
        "parking_kiosk",
        start,
        false,
        start,
        NOW,
      );
      events.forEach((event, index) => {
        if (event.status === "stolen") {
          thefts.push({ stolenAt: event.at, next: events[index + 1] });
        }
      });
    }
    expect(thefts.length).toBeGreaterThan(5);
    const replaced = thefts.filter((theft) => theft.next !== undefined);
    const pending = thefts.filter((theft) => theft.next === undefined);
    expect(replaced.length).toBeGreaterThan(5);
    expect(pending.every((theft) => NOW - theft.stolenAt < 21 * DAY)).toBe(true);
    for (const { stolenAt, next } of replaced) {
      expect(next?.status).toBe("operational");
      expect(next?.reason).toBe("Equipamento reposto");
      expect(next!.at - stolenAt).toBeGreaterThanOrEqual(7 * DAY);
      expect(next!.at - stolenAt).toBeLessThanOrEqual(21 * DAY);
    }
  });
});
