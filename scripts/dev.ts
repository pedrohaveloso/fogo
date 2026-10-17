import { spawn } from "node:child_process";

const children = [
  spawn(
    process.execPath,
    ["--watch-path=src/server", "--watch-path=src/shared", "src/server/main.ts"],
    {
      stdio: "inherit",
    },
  ),
  spawn("pnpm", ["exec", "vite"], { stdio: "inherit" }),
];

function stop(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

for (const child of children) {
  child.on("exit", (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
