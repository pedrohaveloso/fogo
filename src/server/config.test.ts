import { describe, expect, it } from "vitest";
import { ConfigError, readConfig, storedModeProblem } from "./config.ts";

describe("readConfig", () => {
  it("starts in production with its own database and no acceleration", () => {
    expect(readConfig([], { FOGO_LIVE_MULTIPLIER: "50" })).toEqual({
      mode: "production",
      port: 3210,
      databasePath: "data/fogo-production.db",
      liveMultiplier: 1,
      seed: 20261027,
      reset: false,
    });
  });

  it("runs the simulation from the flag or the variable", () => {
    expect(readConfig(["--simulation", "--reset"], {})).toMatchObject({
      mode: "simulation",
      databasePath: "data/fogo.db",
      liveMultiplier: 20,
      reset: true,
    });
    expect(
      readConfig([], {
        FOGO_MODE: "simulation",
        FOGO_DB: "/tmp/x.db",
        FOGO_LIVE_MULTIPLIER: "5",
        PORT: "8080",
      }),
    ).toMatchObject({
      mode: "simulation",
      databasePath: "/tmp/x.db",
      liveMultiplier: 5,
      port: 8080,
    });
  });

  it("refuses an unknown mode and a reset in production", () => {
    expect(() => readConfig([], { FOGO_MODE: "demo" })).toThrow(ConfigError);
    expect(() => readConfig(["--reset"], {})).toThrow(ConfigError);
  });
});

describe("storedModeProblem", () => {
  it("accepts a new database or one from the same mode", () => {
    expect(storedModeProblem(null, "production")).toBeNull();
    expect(storedModeProblem("simulation", "simulation")).toBeNull();
  });

  it("refuses to mix simulated and real data", () => {
    expect(storedModeProblem("simulation", "production")).toMatch(/dados simulados/);
    expect(storedModeProblem("production", "simulation")).toMatch(/produção/);
  });
});
