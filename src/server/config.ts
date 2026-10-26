import { RUN_MODES, type RunMode } from "../shared/types.ts";

export type Config = {
  mode: RunMode;
  port: number;
  databasePath: string;
  liveMultiplier: number;
  seed: number;
  reset: boolean;
};

export class ConfigError extends Error {}

function readMode(argv: readonly string[], env: NodeJS.ProcessEnv): RunMode {
  if (argv.includes("--simulation")) {
    return "simulation";
  }
  const value = env["FOGO_MODE"] ?? "production";
  if (!(RUN_MODES as readonly string[]).includes(value)) {
    throw new ConfigError(`FOGO_MODE deve ser simulation ou production, não "${value}".`);
  }
  return value as RunMode;
}

export function readConfig(argv: readonly string[], env: NodeJS.ProcessEnv): Config {
  const mode = readMode(argv, env);
  const reset = argv.includes("--reset");
  if (reset && mode === "production") {
    throw new ConfigError("--reset apaga o banco e só vale no modo simulação.");
  }
  const simulation = mode === "simulation";
  return {
    mode,
    port: Number(env["PORT"] ?? 3210),
    databasePath: env["FOGO_DB"] ?? (simulation ? "data/fogo.db" : "data/fogo-production.db"),
    liveMultiplier: simulation ? Number(env["FOGO_LIVE_MULTIPLIER"] ?? 20) : 1,
    seed: Number(env["FOGO_SEED"] ?? 20261027),
    reset,
  };
}

export function storedModeProblem(stored: string | null, mode: RunMode): string | null {
  if (stored === null || stored === mode) {
    return null;
  }
  return mode === "production"
    ? "Este banco tem dados simulados. Use outro FOGO_DB para o modo produção."
    : "Este banco é de produção. Use outro FOGO_DB para o modo simulação.";
}
