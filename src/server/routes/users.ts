import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.ts";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "../repositories/users.ts";
import { ValidationError, parseId, parseUserInput } from "../validation.ts";

const NOT_FOUND = { error: "Usuário não encontrado" };

export function userRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/", async (c) => c.json(await listUsers(db)));

  routes.get("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const user = id === null ? null : await getUser(db, id);
    return user ? c.json(user) : c.json(NOT_FOUND, 404);
  });

  routes.post("/", async (c) => {
    const user = await createUser(db, parseUserInput(await c.req.json(), true), now());
    return c.json(user, 201);
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) {
      return c.json(NOT_FOUND, 404);
    }
    const input = parseUserInput(await c.req.json(), false);
    if (id === c.get("user").id && input.role !== "admin") {
      throw new ValidationError([
        { path: "role", message: "Você não pode tirar o seu próprio perfil de administrador" },
      ]);
    }
    const user = await updateUser(db, id, input, now());
    return user ? c.json(user) : c.json(NOT_FOUND, 404);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === c.get("user").id) {
      throw new ValidationError([
        { path: "id", message: "Você não pode excluir o próprio usuário" },
      ]);
    }
    if (id === null || !(await deleteUser(db, id))) {
      return c.json(NOT_FOUND, 404);
    }
    return c.body(null, 204);
  });

  return routes;
}
