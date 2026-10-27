import { describe, expect, it } from "vitest";
import { placePopup } from "./popup.ts";

const VIEWPORT = { top: 0, bottom: 700, width: 1000 };

describe("popup placement", () => {
  it("opens below the anchor when it fits", () => {
    const placement = placePopup(
      { top: 100, bottom: 138, left: 40 },
      { width: 200, height: 200 },
      VIEWPORT,
    );
    expect(placement).toMatchObject({ top: 142, left: 40 });
  });

  it("opens above when the space below is too small and the space above is larger", () => {
    const placement = placePopup(
      { top: 600, bottom: 638, left: 40 },
      { width: 200, height: 300 },
      VIEWPORT,
    );
    expect(placement.top).toBe(600 - 4 - 300);
  });

  it("stays below and limits the height when neither side fits the list", () => {
    const placement = placePopup(
      { top: 100, bottom: 138, left: 40 },
      { width: 200, height: 900 },
      VIEWPORT,
    );
    expect(placement.top).toBe(142);
    expect(placement.maxHeight).toBe(700 - 138 - 4 - 8);
  });

  it("shrinks to the space above when opening upward", () => {
    const placement = placePopup(
      { top: 400, bottom: 438, left: 40 },
      { width: 200, height: 600 },
      { top: 0, bottom: 460, width: 1000 },
    );
    expect(placement.maxHeight).toBe(400 - 4 - 8);
    expect(placement.top).toBe(8);
  });

  it("keeps the popup inside the viewport horizontally", () => {
    expect(
      placePopup({ top: 0, bottom: 38, left: 900 }, { width: 300, height: 100 }, VIEWPORT).left,
    ).toBe(692);
    expect(
      placePopup({ top: 0, bottom: 38, left: -50 }, { width: 300, height: 100 }, VIEWPORT).left,
    ).toBe(8);
  });

  it("never asks for less than a usable height", () => {
    const placement = placePopup(
      { top: 20, bottom: 650, left: 0 },
      { width: 100, height: 500 },
      VIEWPORT,
    );
    expect(placement.maxHeight).toBe(120);
  });

  it("keeps clear of a fixed header and a bottom navigation bar", () => {
    const bounds = { top: 52, bottom: 668, width: 400 };
    const below = placePopup(
      { top: 290, bottom: 322, left: 16 },
      { width: 300, height: 360 },
      bounds,
    );
    expect(below.top).toBe(326);
    expect(below.maxHeight).toBe(668 - 322 - 4 - 8);
    const above = placePopup(
      { top: 600, bottom: 632, left: 16 },
      { width: 300, height: 360 },
      bounds,
    );
    expect(above.maxHeight).toBe(600 - 52 - 4 - 8);
    expect(above.top).toBe(600 - 4 - 360);
  });
});
