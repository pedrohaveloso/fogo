import { beforeEach, describe, expect, it } from "vitest";
import { HOUR } from "../shared/time.ts";
import { loadActivity } from "./activity.ts";
import { openDatabase, type Database } from "./db.ts";
import { createEquipment, recordStatusEvent } from "./repositories/equipment.ts";
import { insertOccurrence, resolveOccurrence } from "./repositories/occurrences.ts";
import { NOW, makeEquipment } from "./test-fixtures.ts";

let db: Database;

function openOccurrence(createdAt: number) {
  return insertOccurrence(db, {
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

beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("loadActivity", () => {
  it("returns an empty feed for an empty database", () => {
    expect(loadActivity(db, NOW - 24 * HOUR).items).toEqual([]);
  });

  it("lists occurrences opened and resolved after the cutoff, newest first", () => {
    const old = openOccurrence(NOW - 30 * HOUR);
    const recent = openOccurrence(NOW - 3 * HOUR);
    resolveOccurrence(db, recent.id, NOW - 1 * HOUR);
    resolveOccurrence(db, old.id, NOW - 2 * HOUR);
    const kinds = loadActivity(db, NOW - 24 * HOUR).items.map((item) => item.kind);
    expect(kinds).toEqual(["occurrence_resolved", "occurrence_resolved", "occurrence_opened"]);
  });

  it("tells equipment going down apart from equipment coming back", () => {
    const equipment = createEquipment(
      db,
      makeEquipment({ serialNumber: "CAM-ACT-1" }),
      NOW - 48 * HOUR,
    );
    recordStatusEvent(db, equipment.id, "malfunction", "Sem imagem", NOW - 5 * HOUR);
    recordStatusEvent(db, equipment.id, "operational", "Reparo", NOW - 2 * HOUR);
    recordStatusEvent(db, equipment.id, "disabled", "Baixa", NOW - 1 * HOUR);
    const items = loadActivity(db, NOW - 24 * HOUR).items;
    expect(items.map((item) => item.kind)).toEqual(["equipment_restored", "equipment_down"]);
    expect(items[1]?.title).toContain("CAM-ACT-1");
    expect(items[1]?.detail).toContain("Sem imagem");
  });

  it("leaves out everything before the cutoff", () => {
    openOccurrence(NOW - 5 * HOUR);
    expect(loadActivity(db, NOW - 4 * HOUR).items).toEqual([]);
  });
});
