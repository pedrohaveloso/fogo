import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { SessionUser, UserRole } from "../shared/types.ts";
import type { Queryable } from "./db.ts";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 30;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64")}:${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) {
    return false;
  }
  const expected = Buffer.from(key, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Queryable, userId: number, now: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.run(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [hashToken(token), userId, now, now + SESSION_MS],
  );
  return token;
}

export async function sessionUser(
  db: Queryable,
  token: string,
  now: number,
): Promise<SessionUser | null> {
  const row = await db.one<{ id: number; username: string; name: string; role: UserRole }>(
    `SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(token), now],
  );
  return row ?? null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function deleteUserSessions(
  db: Queryable,
  userId: number,
  keepToken: string | null,
): Promise<void> {
  await db.run("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [
    userId,
    keepToken === null ? "" : hashToken(keepToken),
  ]);
}

export async function deleteExpiredSessions(db: Queryable, now: number): Promise<void> {
  await db.run("DELETE FROM sessions WHERE expires_at <= $1", [now]);
}

const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

export function createLoginThrottle() {
  const failures = new Map<string, { count: number; since: number }>();

  function blocked(key: string, now: number): boolean {
    const entry = failures.get(key);
    if (!entry || now - entry.since > LOCK_MS) {
      failures.delete(key);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  }

  function fail(key: string, now: number): void {
    const entry = failures.get(key);
    if (!entry || now - entry.since > LOCK_MS) {
      failures.set(key, { count: 1, since: now });
    } else {
      entry.count += 1;
    }
  }

  return { blocked, fail, clear: (key: string) => failures.delete(key) };
}
