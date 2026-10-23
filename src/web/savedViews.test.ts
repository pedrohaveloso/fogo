import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, MAX_VIEWS, addView, parseViews, removeView } from "./savedViews.ts";

describe("parseViews", () => {
  it("returns an empty list for missing or malformed storage", () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews("{")).toEqual([]);
    expect(parseViews('{"name":"x"}')).toEqual([]);
  });

  it("keeps valid entries and drops the rest", () => {
    const raw = JSON.stringify([{ name: "Câmeras", query: "?tipo=camera" }, { name: 3 }, null]);
    expect(parseViews(raw)).toEqual([{ name: "Câmeras", query: "?tipo=camera" }]);
  });

  it("never returns more than the limit", () => {
    const many = Array.from({ length: MAX_VIEWS + 5 }, (_, index) => ({
      name: `v${index}`,
      query: "",
    }));
    expect(parseViews(JSON.stringify(many))).toHaveLength(MAX_VIEWS);
  });
});

describe("addView", () => {
  it("rejects an empty name", () => {
    expect(addView([], "   ", "?tipo=camera")).toBeNull();
  });

  it("trims and truncates the name", () => {
    const [view] = addView([], `  ${"a".repeat(MAX_NAME_LENGTH + 10)}  `, "")!;
    expect(view?.name).toHaveLength(MAX_NAME_LENGTH);
  });

  it("replaces a view with the same name regardless of case", () => {
    const first = addView([], "Parados", "?situacao=malfunction")!;
    const second = addView(first, "parados", "?situacao=stolen")!;
    expect(second).toEqual([{ name: "parados", query: "?situacao=stolen" }]);
  });

  it("refuses a new name when the list is full but still allows replacing one", () => {
    const full = Array.from({ length: MAX_VIEWS }, (_, index) => ({
      name: `v${index}`,
      query: "",
    }));
    expect(addView(full, "novo", "")).toBeNull();
    expect(addView(full, "v0", "?x=1")).toHaveLength(MAX_VIEWS);
  });
});

describe("removeView", () => {
  it("removes by name and ignores unknown names", () => {
    const views = [
      { name: "a", query: "" },
      { name: "b", query: "" },
    ];
    expect(removeView(views, "a")).toEqual([{ name: "b", query: "" }]);
    expect(removeView(views, "zzz")).toEqual(views);
  });
});
