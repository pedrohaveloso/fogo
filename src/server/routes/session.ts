import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { SessionUser } from "../../shared/types.ts";
import { canAccessCity, visibleCityIds } from "../access.ts";
import type { AppDeps, AppEnv } from "../app.ts";
import { clientAddress } from "../clientAddress.ts";
import {
  createLoginThrottle,
  createSession,
  deleteSession,
  deleteUserSessions,
  SESSION_MS,
  verifyPassword,
} from "../auth.ts";
import {
  credentialsOf,
  passwordHashOf,
  preferredCityId,
  setPassword,
  setPreferredCity,
} from "../repositories/users.ts";
import {
  ValidationError,
  parseCityChoice,
  parseLogin,
  parsePasswordChange,
} from "../validation.ts";

export const SESSION_COOKIE = "fogo_session";

function secure(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:" || c.req.header("X-Forwarded-Proto") === "https";
}

export function sessionRoutes(
  deps: AppDeps,
  resolveUser: (c: Context) => Promise<SessionUser | null>,
): Hono<AppEnv> {
  const { db, cities, mode, now } = deps;
  const routes = new Hono<AppEnv>();
  const throttle = createLoginThrottle();

  async function chosenCity(user: SessionUser): Promise<number | null> {
    const summaries = cities.summaries(await visibleCityIds(db, user));
    const stored = await preferredCityId(db, user.id);
    const preferred = summaries.find((item) => item.id === stored);
    return (preferred ?? summaries.find((item) => item.simulated) ?? summaries[0])?.id ?? null;
  }

  routes.get("/", async (c) => {
    const user = await resolveUser(c);
    return c.json({
      mode,
      user,
      cities: user ? cities.summaries(await visibleCityIds(db, user)) : [],
      cityId: user ? await chosenCity(user) : null,
    });
  });

  routes.post("/", async (c) => {
    const { username, password } = parseLogin(await c.req.json());
    const key = `${clientAddress(c)}|${username.toLowerCase()}`;
    const current = now();
    if (throttle.blocked(key, current)) {
      return c.json({ error: "Muitas tentativas. Espere 15 minutos e tente de novo." }, 429);
    }
    const credentials = await credentialsOf(db, username);
    const valid = credentials ? await verifyPassword(password, credentials.passwordHash) : false;
    if (!credentials || !valid) {
      throttle.fail(key, current);
      throw new ValidationError([{ path: "password", message: "Usuário ou senha incorretos" }]);
    }
    throttle.clear(key);
    const token = await createSession(db, credentials.id, current);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: secure(c),
      path: "/",
      maxAge: SESSION_MS / 1000,
    });
    return c.body(null, 204);
  });

  routes.delete("/", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      await deleteSession(db, token);
    }
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  routes.put("/city", async (c) => {
    const user = c.get("user");
    const cityId = parseCityChoice(await c.req.json());
    if (!cities.get(cityId) || !(await canAccessCity(db, user, cityId))) {
      throw new ValidationError([{ path: "cityId", message: "Selecione uma cidade da lista" }]);
    }
    await setPreferredCity(db, user.id, cityId);
    return c.body(null, 204);
  });

  routes.put("/password", async (c) => {
    const user = c.get("user");
    const { current, next } = parsePasswordChange(await c.req.json());
    if (!(await verifyPassword(current, (await passwordHashOf(db, user.id))!))) {
      throw new ValidationError([{ path: "current", message: "Senha atual incorreta" }]);
    }
    await setPassword(db, user.id, next, now());
    await deleteUserSessions(db, user.id, getCookie(c, SESSION_COOKIE) ?? null);
    return c.body(null, 204);
  });

  return routes;
}
