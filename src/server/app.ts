import { Hono, type Context, type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import type { RunMode, SessionUser } from "../shared/types.ts";
import { canAccessCity } from "./access.ts";
import { recordAudit } from "./audit.ts";
import { sessionUser } from "./auth.ts";
import { CityInUseError, CityTakenError, type CityContext, type CityRegistry } from "./cities.ts";
import type { Database } from "./db.ts";
import {
  NeighborhoodInUseError,
  NeighborhoodNameTakenError,
  RegionInUseError,
  RegionNameTakenError,
} from "./neighborhoods.ts";
import { AgencyInUseError, AgencyNameTakenError } from "./repositories/agencies.ts";
import { BadgeTakenError } from "./repositories/agents.ts";
import { SerialNumberTakenError } from "./repositories/equipment.ts";
import { TagTakenError } from "./repositories/tags.ts";
import { LastAdminError, UsernameTakenError } from "./repositories/users.ts";
import { agencyRoutes } from "./routes/agencies.ts";
import { auditRoutes } from "./routes/audit.ts";
import { cityAdminRoutes, cityRoutes } from "./routes/cities.ts";
import { inventoryRoutes } from "./routes/inventory.ts";
import { neighborhoodRoutes } from "./routes/neighborhoods.ts";
import { operationsRoutes } from "./routes/operations.ts";
import { predictionRoutes } from "./routes/predictions.ts";
import { SESSION_COOKIE, sessionRoutes } from "./routes/session.ts";
import { deviceRoutes, tagRoutes } from "./routes/tags.ts";
import { userRoutes } from "./routes/users.ts";
import { ValidationError, parseId } from "./validation.ts";

export type AppDeps = {
  db: Database;
  cities: CityRegistry;
  mode: RunMode;
  now: () => number;
  fetchImpl: typeof fetch;
};

export type AppEnv = { Variables: { user: SessionUser; context: CityContext } };

type Conflict = {
  error: new (...args: never[]) => Error;
  status: 409;
  title: string;
  path: string;
  message: string;
};

const CONFLICTS: Conflict[] = [
  {
    error: SerialNumberTakenError,
    status: 409,
    title: "Número de série já cadastrado",
    path: "serialNumber",
    message: "Já existe um equipamento com este número de série",
  },
  {
    error: BadgeTakenError,
    status: 409,
    title: "Matrícula já cadastrada",
    path: "badge",
    message: "Já existe um agente com esta matrícula nesta cidade",
  },
  {
    error: TagTakenError,
    status: 409,
    title: "Já existe uma tag vinculada",
    path: "target",
    message: "Remova a tag atual antes de criar outra",
  },
  {
    error: NeighborhoodNameTakenError,
    status: 409,
    title: "Bairro já cadastrado",
    path: "name",
    message: "Já existe um bairro com este nome",
  },
  {
    error: NeighborhoodInUseError,
    status: 409,
    title: "Bairro em uso",
    path: "id",
    message:
      "Há equipamentos, agentes ou ocorrências neste bairro. Mude-os de bairro antes de excluir.",
  },
  {
    error: RegionNameTakenError,
    status: 409,
    title: "Zona já cadastrada",
    path: "name",
    message: "Já existe uma zona com este nome",
  },
  {
    error: RegionInUseError,
    status: 409,
    title: "Zona em uso",
    path: "id",
    message: "Há bairros nesta zona. Mude-os de zona antes de excluir.",
  },
  {
    error: AgencyNameTakenError,
    status: 409,
    title: "Órgão já cadastrado",
    path: "name",
    message: "Já existe um órgão com este nome",
  },
  {
    error: AgencyInUseError,
    status: 409,
    title: "Órgão em uso",
    path: "id",
    message: "Há equipamentos ou agentes deste órgão. Mude-os de órgão antes de excluir.",
  },
  {
    error: CityTakenError,
    status: 409,
    title: "Cidade já cadastrada",
    path: "ibgeCode",
    message: "Este município já está no FOGO",
  },
  {
    error: CityInUseError,
    status: 409,
    title: "Cidade em uso",
    path: "id",
    message: "Há equipamentos, agentes ou ocorrências nesta cidade. Exclua-os antes.",
  },
  {
    error: UsernameTakenError,
    status: 409,
    title: "Usuário já cadastrado",
    path: "username",
    message: "Já existe alguém com este usuário",
  },
  {
    error: LastAdminError,
    status: 409,
    title: "Último administrador",
    path: "role",
    message: "O FOGO precisa de ao menos um administrador",
  },
];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const UNAUDITED_PATHS = new Set(["/api/session/city"]);

const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user").role !== "admin") {
    return c.json({ error: "Só administradores podem fazer isso" }, 403);
  }
  await next();
};

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const { db, cities, now } = deps;
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof ValidationError) {
      return c.json({ error: "Dados inválidos", issues: error.issues }, 422);
    }
    const conflict = CONFLICTS.find((item) => error instanceof item.error);
    if (conflict) {
      return c.json(
        { error: conflict.title, issues: [{ path: conflict.path, message: conflict.message }] },
        conflict.status,
      );
    }
    if (error instanceof SyntaxError) {
      return c.json({ error: "JSON inválido" }, 400);
    }
    console.error(error);
    return c.json({ error: "Erro interno" }, 500);
  });

  const resolveUser = async (c: Context): Promise<SessionUser | null> => {
    const token = getCookie(c, SESSION_COOKIE);
    return token ? sessionUser(db, token, now()) : null;
  };

  const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    const user = await resolveUser(c);
    if (!user) {
      return c.json({ error: "Entre com seu usuário para continuar" }, 401);
    }
    c.set("user", user);
    await next();
  };

  const requireCity: MiddlewareHandler<AppEnv> = async (c, next) => {
    const id = parseId(c.req.param("cityId") ?? "");
    const context = id === null ? undefined : cities.get(id);
    if (!context || !(await canAccessCity(db, c.get("user"), context.city.city.id))) {
      return c.json({ error: "Cidade não encontrada" }, 404);
    }
    c.set("context", context);
    await next();
  };

  app.use("/api/*", csrf());

  app.use("/api/*", async (c, next) => {
    await next();
    const user = c.get("user");
    const path = c.req.path;
    if (
      !user ||
      !MUTATING_METHODS.has(c.req.method) ||
      c.res.status >= 400 ||
      UNAUDITED_PATHS.has(path)
    ) {
      return;
    }
    try {
      await recordAudit(db, {
        at: now(),
        userId: user.id,
        username: user.username,
        cityId: c.get("context")?.city.city.id ?? null,
        method: c.req.method,
        path,
        status: c.res.status,
      });
    } catch (error) {
      console.error(error);
    }
  });

  app.get("/api/health", async (c) => {
    await db.one("SELECT 1");
    return c.json({ status: "ok" });
  });
  app.route("/api", deviceRoutes(deps));

  app.use("/api/session/city", requireUser);
  app.use("/api/session/password", requireUser);
  app.route("/api/session", sessionRoutes(deps, resolveUser));

  app.use("/api/*", requireUser);

  app.use("/api/users/*", requireAdmin);
  app.use("/api/audit", requireAdmin);
  app.on(["POST"], "/api/cities", requireAdmin);
  app.use("/api/cities/:cityId/*", requireCity);
  app.on(["PUT", "DELETE"], ["/api/cities/:cityId", "/api/cities/:cityId/boundary"], requireAdmin);

  app.route("/api/users", userRoutes(deps));
  app.route("/api/audit", auditRoutes(deps));
  app.route("/api/cities", cityRoutes(deps));
  const scoped = "/api/cities/:cityId";
  app.route(scoped, cityAdminRoutes(deps));
  app.route(scoped, inventoryRoutes(deps));
  app.route(scoped, operationsRoutes(deps));
  app.route(scoped, neighborhoodRoutes(deps));
  app.route(scoped, agencyRoutes(deps));
  app.route(scoped, tagRoutes(deps));
  app.route(`${scoped}/predictions`, predictionRoutes(deps));
  app.notFound((c) => c.json({ error: "Recurso não encontrado" }, 404));

  return app;
}
