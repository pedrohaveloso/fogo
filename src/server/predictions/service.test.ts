import { describe, expect, it } from "vitest";
import { DAY, HOUR, localDate, startOfLocalDay } from "../../shared/time.ts";
import { NOW } from "../test-fixtures.ts";
import { seededDatabase } from "../test-database.ts";
import { createPredictionService } from "./service.ts";

describe("prediction service trends", () => {
  it(
    "drops days with almost no telemetry and the current day from usage",
    { timeout: 30_000 },
    async () => {
      const { db, city } = await seededDatabase("telemetry");
      const gapStart = startOfLocalDay(NOW) - 4 * DAY;
      await db.run("DELETE FROM readings WHERE hour_start >= $1 AND hour_start < $2", [
        gapStart + 6 * HOUR,
        gapStart + DAY,
      ]);
      const report = await createPredictionService(db, city, 20).trends(NOW);
      const days = report.usage[0]!.days;
      expect(days).not.toContain(localDate(gapStart));
      expect(days).not.toContain(localDate(NOW));
      expect(days).toContain(localDate(gapStart - DAY));
      expect(days).toContain(localDate(gapStart + DAY));
    },
  );
});
