import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: {
      "/api/": { target: "http://localhost:3210", changeOrigin: true },
    },
  },
  test: {
    root: projectRoot,
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    globalSetup: ["src/server/test-setup.ts"],
    maxWorkers: "50%",
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
