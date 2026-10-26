import { describe, expect, it } from "vitest";
import type { Meta } from "../../shared/types.ts";
import { NOW, makeEquipment } from "../../server/test-fixtures.ts";
import {
  EMPTY_FILTERS,
  matchesFilters,
  placeFilterCount,
  showsDownOfType,
  showsUnavailableOnly,
  toggleDownOfType,
  toggleUnavailable,
  toggleUrgentMaintenance,
} from "./OperationsFilters.tsx";

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

  it("searches the street ignoring accents on either side", () => {
    const item = makeEquipment({ street: "Rua São José" });
    expect(matchesFilters(item, { ...EMPTY_FILTERS, search: "sao jose" }, meta, NOW)).toBe(true);
    expect(
      matchesFilters(
        makeEquipment({ street: "Rua Parana" }),
        { ...EMPTY_FILTERS, search: "Paraná" },
        meta,
        NOW,
      ),
    ).toBe(true);
    expect(matchesFilters(item, { ...EMPTY_FILTERS, search: "sao paulo" }, meta, NOW)).toBe(false);
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
    const urgent = { ...EMPTY_FILTERS, maintenance: "urgent" } as const;
    const immediate = makeEquipment({ maintenanceNeed: "immediate", nextMaintenanceAt: null });
    expect(matchesFilters(overdue, urgent, meta, NOW)).toBe(true);
    expect(matchesFilters(immediate, urgent, meta, NOW)).toBe(true);
    expect(matchesFilters(soon, urgent, meta, NOW)).toBe(false);
    expect(matchesFilters(stolen, urgent, meta, NOW)).toBe(false);
  });
});

describe("summary shortcuts", () => {
  it("toggles the map between every status and only the units out of service", () => {
    const down = toggleUnavailable({ ...EMPTY_FILTERS, search: "cam" });
    expect(down.statuses).toEqual(["malfunction", "maintenance", "stolen"]);
    expect(down.search).toBe("cam");
    expect(showsUnavailableOnly(down)).toBe(true);
    expect(toggleUnavailable(down).statuses).toEqual([]);
  });

  it("replaces a partial status choice instead of clearing it", () => {
    const partial = { ...EMPTY_FILTERS, statuses: ["stolen" as const] };
    expect(showsUnavailableOnly(partial)).toBe(false);
    expect(toggleUnavailable(partial).statuses).toEqual(["malfunction", "maintenance", "stolen"]);
    expect(
      showsUnavailableOnly({
        ...EMPTY_FILTERS,
        statuses: ["malfunction", "maintenance", "operational"],
      }),
    ).toBe(false);
  });

  it("shows only the units out of service of one type and toggles back to everything", () => {
    const cameras = toggleDownOfType({ ...EMPTY_FILTERS, search: "av" }, "camera");
    expect(cameras).toEqual({
      ...EMPTY_FILTERS,
      search: "av",
      type: "camera",
      statuses: ["malfunction", "maintenance", "stolen"],
    });
    expect(showsDownOfType(cameras, "camera")).toBe(true);
    expect(showsDownOfType(cameras, "radar")).toBe(false);
    expect(toggleDownOfType(cameras, "radar").type).toBe("radar");
    expect(toggleDownOfType(cameras, "camera")).toEqual({ ...EMPTY_FILTERS, search: "av" });
    expect(showsDownOfType({ ...EMPTY_FILTERS, type: "camera" }, "camera")).toBe(false);
  });

  it("toggles the urgent maintenance filter, replacing any other maintenance choice", () => {
    expect(toggleUrgentMaintenance(EMPTY_FILTERS).maintenance).toBe("urgent");
    expect(toggleUrgentMaintenance({ ...EMPTY_FILTERS, maintenance: "soon" }).maintenance).toBe(
      "urgent",
    );
    expect(toggleUrgentMaintenance({ ...EMPTY_FILTERS, maintenance: "urgent" }).maintenance).toBe(
      "",
    );
  });
});

describe("placeFilterCount", () => {
  it("counts only the filters inside the extra menu", () => {
    expect(placeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      placeFilterCount({ ...EMPTY_FILTERS, search: "radar", type: "radar", statuses: ["stolen"] }),
    ).toBe(0);
    expect(
      placeFilterCount({
        ...EMPTY_FILTERS,
        regionId: "centro",
        neighborhoodId: "fragata",
        agency: "municipal_guard",
        maintenance: "overdue",
      }),
    ).toBe(4);
  });
});
