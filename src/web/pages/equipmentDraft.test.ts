import { describe, expect, it } from "vitest";
import { makeEquipment } from "../../server/test-fixtures.ts";
import { emptyDraft, fromEquipment, toPayload } from "./equipmentDraft.ts";

describe("equipment draft", () => {
  it("starts with defaults taken from the equipment type", () => {
    const draft = emptyDraft("truck_scale");
    expect(draft.agency).toBe("mobility");
    expect(draft.maintenanceIntervalDays).toBe("90");
    expect(draft.status).toBe("not_installed");
  });

  it("converts form strings into the API payload", () => {
    const payload = toPayload({
      ...emptyDraft("radar"),
      lat: "-22,21",
      lng: "",
      installedAt: "",
      maintenanceIntervalDays: "180",
      attributes: { speedLimit: "60", enforcement: "speed", plateReader: true, lanes: "" },
    });
    expect(payload.lat).toBeCloseTo(-22.21);
    expect(payload.lng).toBeNull();
    expect(payload.installedAt).toBeNull();
    expect(payload.maintenanceIntervalDays).toBe(180);
    expect(payload.attributes).toEqual({ speedLimit: 60, enforcement: "speed", plateReader: true });
  });

  it("drops attributes that do not belong to the type", () => {
    const payload = toPayload({
      ...emptyDraft("camera"),
      attributes: { speedLimit: "60", nightVision: false },
    });
    expect(payload.attributes).toEqual({ nightVision: false });
  });

  it("round-trips an existing equipment", () => {
    const draft = fromEquipment(
      makeEquipment({
        attributes: { nightVision: true, resolution: "4k" },
        maintenanceIntervalDays: null,
      }),
    );
    expect(draft.attributes).toEqual({ nightVision: true, resolution: "4k" });
    expect(toPayload(draft)).toMatchObject({
      lat: -22.2139,
      maintenanceIntervalDays: null,
      attributes: { nightVision: true, resolution: "4k" },
    });
  });
});
