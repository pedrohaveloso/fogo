import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { insertCity } from "./city.ts";
import { createCityRegistry } from "./cities.ts";
import type { AuditRecord } from "./audit.ts";
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

beforeEach(async () => {
  db = await emptyDatabase();
  await insertCity(
    db,
    {
      name: "Marília",
      uf: "SP",
      ibgeCode: 3529005,
      center: BOUNDARY[0]!,
      boundary: BOUNDARY,
      simulated: false,
    },
    NOW,
  );
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

async function signIn(): Promise<string> {
  const response = await app.request("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    body: JSON.stringify({ username: "root", password: "root" }),
  });
  return response.headers.get("Set-Cookie")!.split(";")[0]!;
}

function send(cookie: string, method: string, path: string, body?: unknown) {
  return app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function trail(cookie: string, query = ""): Promise<AuditRecord[]> {
  return (await send(cookie, "GET", `/audit${query}`)).json() as Promise<AuditRecord[]>;
}

describe("audit trail", () => {
  it("records who made each successful change, with the city and time", async () => {
    const cookie = await signIn();
    clock += 5000;
    const created = await send(cookie, "POST", "/cities/1/agencies", { name: "Guarda Municipal" });
    expect(created.status).toBe(201);

    const records = await trail(cookie);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      username: "root",
      cityId: 1,
      method: "POST",
      path: "/api/cities/1/agencies",
      status: 201,
      at: new Date(NOW + 5000).toISOString(),
    });
  });

  it("ignores reads, failed changes, logins and the city preference", async () => {
    const cookie = await signIn();
    await send(cookie, "GET", "/cities/1/agencies");
    await send(cookie, "POST", "/cities/1/agencies", { name: "" });
    await send(cookie, "PUT", "/session/city", { cityId: 1 });
    expect(await trail(cookie)).toEqual([]);
  });

  it("filters by city and pages with a cursor", async () => {
    const cookie = await signIn();
    await send(cookie, "POST", "/cities/1/agencies", { name: "Defesa Civil" });
    await send(cookie, "POST", "/cities/1/agencies", { name: "Guarda Municipal" });
    await send(cookie, "POST", "/users", {
      username: "ana",
      name: "Ana",
      role: "admin",
      cityIds: [],
      password: "senha-forte",
    });

    expect(await trail(cookie)).toHaveLength(3);
    expect(await trail(cookie, "?cityId=1")).toHaveLength(2);
    const newest = (await trail(cookie))[0]!;
    expect(await trail(cookie, `?before=${newest.id}`)).toHaveLength(2);
  });

  it("keeps the user name after the user is deleted", async () => {
    const cookie = await signIn();
    const created = await send(cookie, "POST", "/users", {
      username: "ana",
      name: "Ana",
      role: "admin",
      cityIds: [],
      password: "senha-forte",
    });
    const { id } = (await created.json()) as { id: number };
    const ana = await app.request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ username: "ana", password: "senha-forte" }),
    });
    const anaCookie = ana.headers.get("Set-Cookie")!.split(";")[0]!;
    await send(anaCookie, "POST", "/cities/1/agencies", { name: "Defesa Civil" });
    await send(cookie, "DELETE", `/users/${id}`);

    const names = (await trail(cookie)).map((record) => record.username);
    expect(names).toContain("ana");
  });

  it("is closed to people who are not administrators", async () => {
    const cookie = await signIn();
    await send(cookie, "POST", "/users", {
      username: "bia",
      name: "Bia",
      role: "user",
      cityIds: [1],
      password: "senha-forte",
    });
    const bia = await app.request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ username: "bia", password: "senha-forte" }),
    });
    const biaCookie = bia.headers.get("Set-Cookie")!.split(";")[0]!;
    expect((await send(biaCookie, "GET", "/audit")).status).toBe(403);
  });
});

async function post(id: string) {
  return app.request(`/api/tags/${id}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer errado" },
    body: JSON.stringify({ lat: 0, lng: 0 }),
  });
}

describe("device rate limit", () => {
  it("answers 429 with Retry-After after 60 readings from one tag in a minute", async () => {
    const accepted = await Promise.all(Array.from({ length: 60 }, () => post("TAG-AAAAAAAA")));
    expect(accepted.map((response) => response.status)).toEqual(Array(60).fill(401));

    const blocked = await post("TAG-AAAAAAAA");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect((await post("TAG-BBBBBBBB")).status).toBe(401);

    clock += 60_000;
    expect((await post("TAG-AAAAAAAA")).status).toBe(401);
  });
});
