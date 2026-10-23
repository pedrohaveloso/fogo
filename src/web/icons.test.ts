import { describe, expect, it } from "vitest";
import { AGENT_ROLE_KEYS, EQUIPMENT_TYPE_KEYS } from "../shared/catalog.ts";
import { AGENT_GLYPH, AGENT_ROLE_GLYPHS, TYPE_GLYPHS } from "./icons.tsx";

describe("map glyphs", () => {
  it("gives every agent role its own symbol", () => {
    const glyphs = AGENT_ROLE_KEYS.map((role) => AGENT_ROLE_GLYPHS[role]);
    expect(glyphs.every((glyph) => glyph.length > 0)).toBe(true);
    expect(new Set(glyphs).size).toBe(AGENT_ROLE_KEYS.length);
    expect(glyphs).not.toContain(AGENT_GLYPH);
  });

  it("gives every equipment type its own symbol, distinct from the agent ones", () => {
    const glyphs = EQUIPMENT_TYPE_KEYS.map((type) => TYPE_GLYPHS[type]);
    expect(new Set(glyphs).size).toBe(EQUIPMENT_TYPE_KEYS.length);
    for (const role of AGENT_ROLE_KEYS) {
      expect(glyphs).not.toContain(AGENT_ROLE_GLYPHS[role]);
    }
  });
});
