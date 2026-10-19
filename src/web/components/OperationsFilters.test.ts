import { describe, expect, it } from "vitest";
import type { Meta } from "../../shared/types.ts";
import { NOW, makeEquipment } from "../../server/test-fixtures.ts";
import { EMPTY_FILTERS, advancedFilterCount, matchesFilters } from "./OperationsFilters.tsx";

const meta = {
  neighborhoods: [
    { id: "centro", name: "Centro", regionId: "center", lat: 0, lng: 0, polygon: [] },
    { id: "fragata", name: "Fragata", regionId: "south", lat: 0, lng: 0, polygon: [] },
  ],
} as unknown as Meta;

describe("matchesFilters", () => {
  it("accepts everything with empty filters", () => {
    expect(matchesFilters(makeEquipment(), EMPTY_FILTERS, meta, NOW)).toBe(true);
  });

  it("filters by type, status, region, neighborhood, agency and search", () => {
    const item = makeEquipment({ neighborhoodId: "fragata", street: "Rua das Flores" });
    expect(matchesFilters(item, { ...EMPTY_FILTERS, type: "radar" }, meta, NOW)).toBe(false);
    expect(
      matchesFilters(item, { ...EMPTY_FILTERS, statuses: ["operational", "stolen"] }, meta, NOW),
    ).toBe(true);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, regionId: "center" }, meta, NOW)).toBe(false);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, regionId: "south" }, meta, NOW)).toBe(true);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, neighborhoodId: "centro" }, meta, NOW)).toBe(
      false,
    );
    expect(matchesFilters(item, { ...EMPTY_FILTERS, agency: "mobility" }, meta, NOW)).toBe(false);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, search: "FLORES" }, meta, NOW)).toBe(true);
  });

  it("filters by maintenance urgency", () => {
    const overdue = makeEquipment({ nextMaintenanceAt: "2026-10-01" });
    const soon = makeEquipment({ nextMaintenanceAt: "2026-10-18" });
    const stolen = makeEquipment({
      status: "stolen",
      nextMaintenanceAt: "2026-10-01",
      maintenanceNeed: "immediate",
    });
    expect(matchesFilters(overdue, { ...EMPTY_FILTERS, maintenance: "overdue" }, meta, NOW)).toBe(
      true,
    );
    expect(matchesFilters(soon, { ...EMPTY_FILTERS, maintenance: "overdue" }, meta, NOW)).toBe(
      false,
    );
    expect(matchesFilters(soon, { ...EMPTY_FILTERS, maintenance: "soon" }, meta, NOW)).toBe(true);
    expect(matchesFilters(stolen, { ...EMPTY_FILTERS, maintenance: "overdue" }, meta, NOW)).toBe(
      false,
    );
    expect(matchesFilters(stolen, { ...EMPTY_FILTERS, maintenance: "immediate" }, meta, NOW)).toBe(
      true,
    );
  });
});

describe("advancedFilterCount", () => {
  it("counts only the filters kept behind the disclosure", () => {
    expect(advancedFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      advancedFilterCount({ ...EMPTY_FILTERS, search: "radar", statuses: ["operational"] }),
    ).toBe(0);
    expect(
      advancedFilterCount({
        ...EMPTY_FILTERS,
        type: "radar",
        regionId: "south",
        neighborhoodId: "fragata",
        agency: "mobility",
        maintenance: "soon",
      }),
    ).toBe(5);
  });
});
