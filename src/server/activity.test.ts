import { beforeEach, describe, expect, it } from "vitest";
import { HOUR } from "../shared/time.ts";
import { loadActivity } from "./activity.ts";
import type { CityDataset } from "../shared/types.ts";
import type { Database } from "./db.ts";
import { createEquipment, recordStatusEvent } from "./repositories/equipment.ts";
import { insertOccurrence, resolveOccurrence } from "./repositories/occurrences.ts";
import { NOW, makeEquipment } from "./test-fixtures.ts";
import { cityDatabase } from "./test-database.ts";

let db: Database;
let city: CityDataset;

function openOccurrence(createdAt: number) {
  return insertOccurrence(db, {
    cityId: city.city.id,
    kind: "accident",
    severity: 3,
    neighborhoodId: "centro",
    lat: -22.2139,
    lng: -49.9458,
    description: "Colisão",
    equipmentId: null,
    source: "live",
    createdAt,
  });
}

beforeEach(async () => {
  ({ db, city } = await cityDatabase());
});

describe("loadActivity", () => {
  it("returns an empty feed for an empty database", async () => {
    expect((await loadActivity(db, city, NOW - 24 * HOUR)).items).toEqual([]);
  });

  it("lists occurrences opened and resolved after the cutoff, newest first", async () => {
    const old = await openOccurrence(NOW - 30 * HOUR);
    const recent = await openOccurrence(NOW - 3 * HOUR);
    await resolveOccurrence(db, recent.id, NOW - 1 * HOUR);
    await resolveOccurrence(db, old.id, NOW - 2 * HOUR);
    const other = await cityDatabase();
    expect((await loadActivity(other.db, other.city, NOW - 24 * HOUR)).items).toEqual([]);
    const kinds = (await loadActivity(db, city, NOW - 24 * HOUR)).items.map((item) => item.kind);
    expect(kinds).toEqual(["occurrence_resolved", "occurrence_resolved", "occurrence_opened"]);
  });

  it("tells equipment going down apart from equipment coming back", async () => {
    const equipment = await createEquipment(
      db,
      makeEquipment({ serialNumber: "CAM-ACT-1" }),
      NOW - 48 * HOUR,
    );
    await recordStatusEvent(db, equipment.id, "malfunction", "Sem imagem", NOW - 5 * HOUR);
    await recordStatusEvent(db, equipment.id, "operational", "Reparo", NOW - 2 * HOUR);
    await recordStatusEvent(db, equipment.id, "disabled", "Baixa", NOW - 1 * HOUR);
    const items = (await loadActivity(db, city, NOW - 24 * HOUR)).items;
    expect(items.map((item) => item.kind)).toEqual(["equipment_restored", "equipment_down"]);
    expect(items[1]?.title).toContain("CAM-ACT-1");
    expect(items[1]?.detail).toContain("Sem imagem");
  });

  it("leaves out everything before the cutoff", async () => {
    await openOccurrence(NOW - 5 * HOUR);
    expect((await loadActivity(db, city, NOW - 4 * HOUR)).items).toEqual([]);
  });
});
