import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  pageFromQuery,
  pageOfIndex,
  paginate,
  parsePageSize,
  withPage,
} from "./pagination.ts";

const rows = Array.from({ length: 123 }, (_, index) => index);

describe("paginate", () => {
  it("cuts pages of fifty and reports the visible range", () => {
    expect(PAGE_SIZE).toBe(50);
    const first = paginate(rows, 1);
    expect(first.items).toHaveLength(50);
    expect(first).toMatchObject({ page: 1, pageCount: 3, first: 1, last: 50, total: 123 });
    const last = paginate(rows, 3);
    expect(last.items).toEqual(rows.slice(100));
    expect(last).toMatchObject({ first: 101, last: 123 });
  });

  it("clamps pages past the end or before the start", () => {
    expect(paginate(rows, 9).page).toBe(3);
    expect(paginate(rows, 0).page).toBe(1);
    expect(paginate(rows, -4).page).toBe(1);
  });

  it("keeps a single empty page when nothing matches", () => {
    expect(paginate([], 2)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      first: 0,
      last: 0,
      total: 0,
    });
  });

  it("ends a page exactly on the boundary", () => {
    expect(paginate(rows.slice(0, 100), 2)).toMatchObject({ pageCount: 2, first: 51, last: 100 });
  });
});

describe("page in the address", () => {
  it("reads only whole pages above one", () => {
    expect(pageFromQuery(new URLSearchParams("page=3"))).toBe(3);
    expect(pageFromQuery(new URLSearchParams())).toBe(1);
    expect(pageFromQuery(new URLSearchParams("page=abc"))).toBe(1);
    expect(pageFromQuery(new URLSearchParams("page=2.5"))).toBe(1);
    expect(pageFromQuery(new URLSearchParams("page=-2"))).toBe(1);
  });

  it("writes the page next to other parameters and drops page one", () => {
    expect(withPage("?type=camera", 2)).toBe("?type=camera&page=2");
    expect(withPage("?type=camera&page=4", 1)).toBe("?type=camera");
    expect(withPage("", 1)).toBe("");
  });

  it("finds the page that holds a row", () => {
    expect(pageOfIndex(0)).toBe(1);
    expect(pageOfIndex(49)).toBe(1);
    expect(pageOfIndex(50)).toBe(2);
  });
});

describe("page size", () => {
  it("accepts the listed sizes and all, and falls back to fifty", () => {
    expect(parsePageSize("10")).toBe(10);
    expect(parsePageSize("100")).toBe(100);
    expect(parsePageSize("all")).toBe("all");
    expect(parsePageSize(null)).toBe(PAGE_SIZE);
    expect(parsePageSize("7")).toBe(PAGE_SIZE);
    expect(parsePageSize("abc")).toBe(PAGE_SIZE);
  });

  it("cuts pages of the chosen size", () => {
    expect(paginate(rows, 3, 25)).toMatchObject({ pageCount: 5, first: 51, last: 75 });
    expect(pageOfIndex(60, 25)).toBe(3);
  });

  it("shows every row on one page when all is chosen", () => {
    const all = paginate(rows, 4, "all");
    expect(all.items).toEqual(rows);
    expect(all).toMatchObject({ page: 1, pageCount: 1, first: 1, last: 123, total: 123 });
    expect(paginate([], 1, "all")).toMatchObject({ pageCount: 1, first: 0, last: 0 });
    expect(pageOfIndex(120, "all")).toBe(1);
  });
});
