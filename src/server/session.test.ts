import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "../shared/types.ts";
import { createApp } from "./app.ts";
import { hashPassword, verifyPassword } from "./auth.ts";
import { insertCity } from "./city.ts";
import { createCityRegistry } from "./cities.ts";
import type { Database } from "./db.ts";
import { ensureRootUser } from "./repositories/users.ts";
import { emptyDatabase } from "./test-database.ts";
import { NOW } from "./test-fixtures.ts";

const BOUNDARY: [number, number][] = [
  [-49.9, -22.1],
  [-49.8, -22.1],
  [-49.8, -22.2],
];

let db: Database;
let app: ReturnType<typeof createApp>;
let clock: number;

function cityRecord(name: string, ibgeCode: number) {
  return { name, uf: "SP", ibgeCode, center: BOUNDARY[0]!, boundary: BOUNDARY, simulated: false };
}

beforeEach(async () => {
  db = await emptyDatabase();
  await insertCity(db, cityRecord("Marília", 3529005), NOW);
  await insertCity(db, cityRecord("Garça", 3516705), NOW);
  await ensureRootUser(db, "root", NOW);
  clock = NOW;
  app = createApp({
    db,
    cities: await createCityRegistry(db, { liveMultiplier: 1 }),
    mode: "production",
    now: () => clock,
    fetchImpl: vi.fn<typeof fetch>(),
  });
});

function client() {
  let cookie = "";
  async function send<T>(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
    };
    if (cookie) {
      headers["Cookie"] = cookie;
    }
    const response = await app.request(`/api${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      cookie = setCookie.split(";")[0]!;
    }
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : null) as T, setCookie };
  }
  return { send, cookie: () => cookie };
}

async function loggedIn(username: string, password: string) {
  const user = client();
  const { status } = await user.send("POST", "/session", { username, password });
  expect(status).toBe(204);
  return user;
}

describe("login", () => {
  it("keeps everything behind a session except health and session status", async () => {
    const guest = client();
    expect((await guest.send("GET", "/cities")).status).toBe(401);
    expect((await guest.send("GET", "/cities/1/meta")).status).toBe(401);
    expect((await guest.send("GET", "/health")).status).toBe(200);
    expect((await guest.send<Session>("GET", "/session")).body).toEqual({
      mode: "production",
      user: null,
      cities: [],
      cityId: null,
    });
  });

  it("lets root in with the default password and sets an HttpOnly cookie", async () => {
    const root = client();
    const wrong = await root.send<{ issues: { message: string }[] }>("POST", "/session", {
      username: "root",
      password: "errada",
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.issues[0]!.message).toBe("Usuário ou senha incorretos");
    const ok = await root.send("POST", "/session", { username: "ROOT", password: "root" });
    expect(ok.setCookie).toContain("HttpOnly");
    expect(ok.setCookie).toContain("SameSite=Lax");
    const session = await root.send<Session>("GET", "/session");
    expect(session.body.user).toMatchObject({ username: "root", role: "admin" });
    expect(session.body.cities.map((item) => item.name)).toEqual(["Garça", "Marília"]);
  });

  it("logs out and expires sessions", async () => {
    const root = await loggedIn("root", "root");
    expect((await root.send("GET", "/cities")).status).toBe(200);
    expect((await root.send("DELETE", "/session")).status).toBe(204);
    expect((await root.send<Session>("GET", "/session")).body.user).toBeNull();

    const again = await loggedIn("root", "root");
    clock += 31 * 24 * 60 * 60 * 1000;
    expect((await again.send("GET", "/cities")).status).toBe(401);
  });

  it("locks a user name after too many wrong passwords from the same place", async () => {
    const guest = client();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        guest.send("POST", "/session", { username: "root", password: "errada" }),
      ),
    );
    expect(
      (await guest.send("POST", "/session", { username: "root", password: "root" })).status,
    ).toBe(429);
    clock += 16 * 60 * 1000;
    expect(
      (await guest.send("POST", "/session", { username: "root", password: "root" })).status,
    ).toBe(204);
  });
});

describe("users", () => {
  it("lets an admin create a user who only sees the assigned cities", async () => {
    const root = await loggedIn("root", "root");
    const created = await root.send<User>("POST", "/users", {
      username: "ana",
      name: "Ana Souza",
      role: "user",
      cityIds: [2],
      password: "senha-forte",
    });
    expect(created).toMatchObject({ status: 201, body: { username: "ana", cityIds: [2] } });
    expect(
      (await root.send("POST", "/users", { ...created.body, password: "outra-senha" })).status,
    ).toBe(409);

    const ana = await loggedIn("ana", "senha-forte");
    const session = await ana.send<Session>("GET", "/session");
    expect(session.body).toMatchObject({ user: { role: "user" }, cityId: 2 });
    expect(session.body.cities.map((item) => item.id)).toEqual([2]);
    expect((await ana.send("GET", "/cities/2/meta")).status).toBe(200);
    expect((await ana.send("GET", "/cities/1/meta")).status).toBe(404);
    expect((await ana.send("PUT", "/session/city", { cityId: 1 })).status).toBe(422);
    expect((await ana.send("POST", "/cities/2/agencies", { name: "Guarda" })).status).toBe(201);
  });

  it("keeps user and city management with admins", async () => {
    const root = await loggedIn("root", "root");
    await root.send("POST", "/users", {
      username: "bia",
      name: "Bia Lima",
      role: "user",
      cityIds: [1],
      password: "senha-forte",
    });
    const bia = await loggedIn("bia", "senha-forte");
    expect((await bia.send("GET", "/users")).status).toBe(403);
    expect((await bia.send("POST", "/cities", {})).status).toBe(403);
    expect((await bia.send("DELETE", "/cities/1")).status).toBe(403);
    expect((await bia.send("PUT", "/cities/1/boundary", { boundary: BOUNDARY })).status).toBe(403);
    expect((await bia.send("GET", "/places/states/SP/municipalities")).status).toBe(403);
    expect((await bia.send("GET", "/cities/1")).status).toBe(200);
  });

  it("protects the last admin and the admin's own account", async () => {
    const root = await loggedIn("root", "root");
    const users = (await root.send<User[]>("GET", "/users")).body;
    const rootId = users[0]!.id;
    const demote = await root.send<{ issues: { path: string }[] }>("PUT", `/users/${rootId}`, {
      username: "root",
      name: "Administrador",
      role: "user",
      cityIds: [],
    });
    expect(demote.status).toBe(422);
    expect((await root.send("DELETE", `/users/${rootId}`)).status).toBe(422);
    const other = await root.send<User>("POST", "/users", {
      username: "carla",
      name: "Carla Dias",
      role: "admin",
      cityIds: [],
      password: "senha-forte",
    });
    const carla = await loggedIn("carla", "senha-forte");
    expect((await carla.send("DELETE", `/users/${rootId}`)).status).toBe(204);
    const last = await carla.send("PUT", `/users/${other.body.id}`, {
      username: "carla",
      name: "Carla Dias",
      role: "user",
      cityIds: [],
    });
    expect(last.status).toBe(422);
    expect((await carla.send("GET", "/users/999")).status).toBe(404);
  });

  it("signs a user out everywhere when an admin resets the password", async () => {
    const root = await loggedIn("root", "root");
    const created = await root.send<User>("POST", "/users", {
      username: "davi",
      name: "Davi Reis",
      role: "user",
      cityIds: [1],
      password: "senha-forte",
    });
    const davi = await loggedIn("davi", "senha-forte");
    await root.send("PUT", `/users/${created.body.id}`, {
      username: "davi",
      name: "Davi Reis",
      role: "user",
      cityIds: [1, 2],
      password: "nova-senha-1",
    });
    expect((await davi.send("GET", "/cities")).status).toBe(401);
    const back = await loggedIn("davi", "nova-senha-1");
    expect((await back.send<Session>("GET", "/session")).body.cities).toHaveLength(2);
  });
});

describe("own account", () => {
  it("changes the password, keeping only the current session", async () => {
    const here = await loggedIn("root", "root");
    const elsewhere = await loggedIn("root", "root");
    const wrong = await here.send("PUT", "/session/password", {
      current: "errada",
      next: "nova-senha-1",
    });
    expect(wrong.status).toBe(422);
    expect(
      (await here.send("PUT", "/session/password", { current: "root", next: "nova-senha-1" }))
        .status,
    ).toBe(204);
    expect((await here.send("GET", "/cities")).status).toBe(200);
    expect((await elsewhere.send("GET", "/cities")).status).toBe(401);
    await loggedIn("root", "nova-senha-1");
  });

  it("remembers the chosen city between sessions", async () => {
    const first = await loggedIn("root", "root");
    expect((await first.send<Session>("GET", "/session")).body.cityId).toBe(2);
    expect((await first.send("PUT", "/session/city", { cityId: 1 })).status).toBe(204);
    const second = await loggedIn("root", "root");
    expect((await second.send<Session>("GET", "/session")).body.cityId).toBe(1);
  });
});

describe("password hashing", () => {
  it("salts every hash and rejects other passwords and unknown formats", async () => {
    const first = await hashPassword("segredo-1");
    expect(first).not.toBe(await hashPassword("segredo-1"));
    expect(await verifyPassword("segredo-1", first)).toBe(true);
    expect(await verifyPassword("segredo-2", first)).toBe(false);
    expect(await verifyPassword("segredo-1", "md5:abc")).toBe(false);
  });

  it("creates root only in an empty database", async () => {
    expect(await ensureRootUser(db, "outra", NOW)).toBe(false);
  });
});
