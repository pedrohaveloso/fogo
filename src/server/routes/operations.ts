import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HOUR } from "../../shared/time.ts";
import { loadActivity } from "../activity.ts";
import type { AppDeps } from "../app.ts";
import type { LiveMessage } from "../live.ts";
import {
  getOccurrence,
  insertOccurrence,
  listActiveOccurrences,
  listRecentOccurrences,
  resolveOccurrence,
} from "../repositories/occurrences.ts";
import { parseId, parseOccurrenceInput } from "../validation.ts";

const KEEP_ALIVE_MS = 20_000;
const MAX_QUEUE = 30;

export function operationsRoutes(deps: AppDeps): Hono {
  const { db, hub, now, predictions } = deps;
  const routes = new Hono();

  routes.get("/operations/snapshot", (c) => c.json(hub.snapshot(now())));

  routes.get("/operations/stream", (c) =>
    streamSSE(c, async (stream) => {
      const queue: LiveMessage[] = [];
      let wake: (() => void) | null = null;
      const unsubscribe = hub.subscribe((message) => {
        if (queue.length >= MAX_QUEUE) {
          queue.length = 0;
          queue.push({ type: "snapshot", data: hub.snapshot(now()) });
        } else {
          queue.push(message);
        }
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      await stream.writeSSE({ event: "snapshot", data: JSON.stringify(hub.snapshot(now())) });
      while (!stream.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, KEEP_ALIVE_MS);
          });
          wake = null;
        }
        const message = queue.shift();
        if (stream.aborted) {
          break;
        }
        if (message) {
          await stream.writeSSE({ event: message.type, data: JSON.stringify(message.data) });
        } else {
          await stream.writeSSE({ event: "ping", data: "" });
        }
      }
      unsubscribe();
    }),
  );

  routes.get("/activity", (c) => {
    const current = now();
    const requested = Number(c.req.query("since"));
    const earliest = current - 24 * HOUR;
    const since = Number.isFinite(requested) && requested > earliest ? requested : earliest;
    return c.json(loadActivity(db, since));
  });

  routes.get("/occurrences", (c) => {
    if (c.req.query("scope") === "recent") {
      return c.json(listRecentOccurrences(db, now() - 24 * HOUR, 200));
    }
    return c.json(listActiveOccurrences(db));
  });

  routes.get("/occurrences/heat", (c) => {
    const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 30));
    const rows = db
      .prepare("SELECT lng, lat FROM occurrences WHERE created_at >= ?")
      .all(now() - days * 24 * HOUR) as { lng: number; lat: number }[];
    return c.json(rows.map((row) => [row.lng, row.lat]));
  });

  routes.post("/occurrences", async (c) => {
    const input = parseOccurrenceInput(await c.req.json());
    const occurrence = insertOccurrence(db, {
      ...input,
      equipmentId: null,
      source: "manual",
      createdAt: now(),
    });
    predictions.invalidate();
    hub.publish({ occurrences: [occurrence] }, now());
    return c.json(occurrence, 201);
  });

  routes.post("/occurrences/:id/resolve", (c) => {
    const id = parseId(c.req.param("id"));
    const occurrence = id === null ? null : getOccurrence(db, id);
    if (!occurrence) {
      return c.json({ error: "Ocorrência não encontrada" }, 404);
    }
    if (occurrence.status !== "resolved") {
      resolveOccurrence(db, occurrence.id, now());
      db.prepare(
        "UPDATE agents SET status = 'available', occurrence_id = NULL WHERE occurrence_id = ?",
      ).run(occurrence.id);
    }
    const updated = getOccurrence(db, occurrence.id)!;
    hub.publish({ occurrences: [updated] }, now());
    return c.json(updated);
  });

  routes.post("/alerts/:id/ack", (c) => {
    hub.acknowledge(c.req.param("id"), now());
    hub.publish({}, now());
    return c.body(null, 204);
  });

  routes.delete("/alerts/:id/ack", (c) => {
    hub.unacknowledge(c.req.param("id"));
    hub.publish({}, now());
    return c.body(null, 204);
  });

  return routes;
}
