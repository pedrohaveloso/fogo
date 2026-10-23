import { describe, expect, it } from "vitest";
import { DAY, HOUR, localDate, startOfLocalDay } from "../../shared/time.ts";
import { city } from "../city.ts";
import { openDatabase } from "../db.ts";
import { seedDatabase } from "../seed/index.ts";
import { NOW } from "../test-fixtures.ts";
import { createPredictionService } from "./service.ts";

describe("prediction service trends", () => {
  it(
    "drops days with almost no telemetry and the current day from usage",
    { timeout: 30_000 },
    () => {
      const db = openDatabase(":memory:");
      seedDatabase(db, city, { now: NOW, seed: 4, historyDays: 30, readingDays: 10 });
      const gapStart = startOfLocalDay(NOW) - 4 * DAY;
      db.prepare("DELETE FROM readings WHERE hour_start >= ? AND hour_start < ?").run(
        gapStart + 6 * HOUR,
        gapStart + DAY,
      );
      const report = createPredictionService(db, city, 20).trends(NOW);
      const days = report.usage[0]!.days;
      expect(days).not.toContain(localDate(gapStart));
      expect(days).not.toContain(localDate(NOW));
      expect(days).toContain(localDate(gapStart - DAY));
      expect(days).toContain(localDate(gapStart + DAY));
    },
  );
});
