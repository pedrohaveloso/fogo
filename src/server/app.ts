import { Hono } from "hono";
import type { CityDataset } from "../shared/types.ts";
import type { Database } from "./db.ts";
import type { LiveHub } from "./live.ts";
import type { NeighborhoodShapes } from "./neighborhoods.ts";
import type { PredictionService } from "./predictions/service.ts";
import { BadgeTakenError } from "./repositories/agents.ts";
import { SerialNumberTakenError } from "./repositories/equipment.ts";
import { inventoryRoutes } from "./routes/inventory.ts";
import { neighborhoodRoutes } from "./routes/neighborhoods.ts";
import { operationsRoutes } from "./routes/operations.ts";
import { predictionRoutes } from "./routes/predictions.ts";
import { ValidationError } from "./validation.ts";

export type AppDeps = {
  db: Database;
  city: CityDataset;
  hub: LiveHub;
  shapes: NeighborhoodShapes;
  predictions: PredictionService;
  liveMultiplier: number;
  now: () => number;
  fetchImpl: typeof fetch;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json({ error: "Dados inválidos", issues: error.issues }, 422);
    }
    if (error instanceof SerialNumberTakenError) {
      return c.json(
        {
          error: "Número de série já cadastrado",
          issues: [
            { path: "serialNumber", message: "Já existe um equipamento com este número de série" },
          ],
        },
        409,
      );
    }
    if (error instanceof BadgeTakenError) {
      return c.json(
        {
          error: "Matrícula já cadastrada",
          issues: [{ path: "badge", message: "Já existe um agente com esta matrícula" }],
        },
        409,
      );
    }
    if (error instanceof SyntaxError) {
      return c.json({ error: "JSON inválido" }, 400);
    }
    console.error(error);
    return c.json({ error: "Erro interno" }, 500);
  });

  app.get("/api/health", (c) => {
    deps.db.prepare("SELECT 1").get();
    return c.json({ status: "ok" });
  });
  app.route("/api", inventoryRoutes(deps));
  app.route("/api", operationsRoutes(deps));
  app.route("/api", neighborhoodRoutes(deps));
  app.route("/api/predictions", predictionRoutes(deps));
  app.notFound((c) => c.json({ error: "Recurso não encontrado" }, 404));

  return app;
}
