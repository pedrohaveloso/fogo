import { describe, expect, it } from "vitest";
import { filterOptions, matchTypeahead, moveActive } from "./Select.tsx";

describe("select keyboard", () => {
  it("moves within the list without wrapping", () => {
    expect(moveActive(0, 3, "ArrowDown")).toBe(1);
    expect(moveActive(2, 3, "ArrowDown")).toBe(2);
    expect(moveActive(0, 3, "ArrowUp")).toBe(0);
    expect(moveActive(1, 3, "Home")).toBe(0);
    expect(moveActive(1, 3, "End")).toBe(2);
  });

  it("ignores other keys and empty lists", () => {
    expect(moveActive(0, 3, "a")).toBeNull();
    expect(moveActive(0, 0, "ArrowDown")).toBeNull();
  });

  it("finds the next label that starts with what was typed, wrapping around", () => {
    const labels = ["Agente", "Guarda", "Gestor", "Fiscal"];
    expect(matchTypeahead(labels, "g", 0)).toBe(1);
    expect(matchTypeahead(labels, "g", 1)).toBe(2);
    expect(matchTypeahead(labels, "g", 2)).toBe(1);
    expect(matchTypeahead(labels, "ge", 0)).toBe(2);
    expect(matchTypeahead(labels, "z", 0)).toBeNull();
  });
});

describe("select search", () => {
  const options = [
    { value: "1", label: "Marília" },
    { value: "2", label: "Garça" },
    { value: "3", label: "Pompeia" },
  ];

  it("keeps every option for a blank query", () => {
    expect(filterOptions(options, "  ")).toHaveLength(3);
  });

  it("matches anywhere in the label, ignoring case and accents", () => {
    expect(filterOptions(options, "ili").map((option) => option.value)).toEqual(["1"]);
    expect(filterOptions(options, "p").map((option) => option.value)).toEqual(["3"]);
    expect(filterOptions(options, "xyz")).toEqual([]);
  });
});
