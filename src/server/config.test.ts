import { describe, expect, it } from "vitest";
import { ConfigError, describeDatabase, readConfig, storedModeProblem } from "./config.ts";

describe("readConfig", () => {
  it("starts in production with its own database and no acceleration", () => {
    expect(readConfig([], { FOGO_LIVE_MULTIPLIER: "50" })).toEqual({
      mode: "production",
      port: 3210,
      databaseUrl: "postgres://fogo:fogo@localhost:5432/fogo_production",
      liveMultiplier: 1,
      seed: 20261027,
      reset: false,
      rootPassword: "root",
    });
  });

  it("takes the production root password from the environment, ignoring an empty one", () => {
    expect(readConfig([], { FOGO_ROOT_PASSWORD: "troque-me" }).rootPassword).toBe("troque-me");
    expect(readConfig([], { FOGO_ROOT_PASSWORD: "" }).rootPassword).toBe("root");
    expect(readConfig(["--simulation"], { FOGO_ROOT_PASSWORD: "troque-me" }).rootPassword).toBe(
      "root",
    );
  });

  it("runs the simulation from the flag or the variable", () => {
    expect(readConfig(["--simulation", "--reset"], {})).toMatchObject({
      mode: "simulation",
      databaseUrl: "postgres://fogo:fogo@localhost:5432/fogo_simulation",
      liveMultiplier: 20,
      reset: true,
    });
    expect(
      readConfig([], {
        FOGO_MODE: "simulation",
        DATABASE_URL: "postgres://app:segredo@db:5432/fogo",
        FOGO_LIVE_MULTIPLIER: "5",
        PORT: "8080",
      }),
    ).toMatchObject({
      mode: "simulation",
      databaseUrl: "postgres://app:segredo@db:5432/fogo",
      liveMultiplier: 5,
      port: 8080,
    });
  });

  it("refuses an unknown mode and a reset in production", () => {
    expect(() => readConfig([], { FOGO_MODE: "demo" })).toThrow(ConfigError);
    expect(() => readConfig(["--reset"], {})).toThrow(ConfigError);
  });
});

describe("describeDatabase", () => {
  it("shows where the database is without the password", () => {
    expect(describeDatabase("postgres://app:segredo@db:6543/fogo")).toBe("db:6543/fogo");
    expect(describeDatabase("postgres://app:segredo@db/fogo")).toBe("db:5432/fogo");
    expect(describeDatabase("não é url")).toBe("DATABASE_URL inválida");
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
