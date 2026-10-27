import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

export function clientAddress(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? "local";
  } catch {
    return "local";
  }
}
