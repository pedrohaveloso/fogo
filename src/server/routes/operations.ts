import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HOUR } from "../../shared/time.ts";
import { loadActivity } from "../activity.ts";
import type { AppDeps, AppEnv } from "../app.ts";
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

export function operationsRoutes(deps: AppDeps): Hono<AppEnv> {
  const { db, now } = deps;
  const routes = new Hono<AppEnv>();

  routes.get("/operations/snapshot", async (c) =>
    c.json(await c.get("context").hub.snapshot(now())),
  );

  routes.get("/operations/stream", (c) => {
    const { hub } = c.get("context");
    return streamSSE(c, async (stream) => {
      const queue: LiveMessage[] = [];
      let resync = false;
      let wake: (() => void) | null = null;
      const unsubscribe = hub.subscribe((message) => {
        if (queue.length >= MAX_QUEUE) {
          queue.length = 0;
          resync = true;
        } else {
          queue.push(message);
        }
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      await stream.writeSSE({ event: "snapshot", data: JSON.stringify(await hub.snapshot(now())) });
      while (!stream.aborted) {
        if (queue.length === 0 && !resync) {
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, KEEP_ALIVE_MS);
          });
          wake = null;
        }
        let message = queue.shift();
        if (resync) {
          resync = false;
          queue.length = 0;
          message = { type: "snapshot", data: await hub.snapshot(now()) };
        }
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
    });
  });

  routes.get("/activity", async (c) => {
    const current = now();
    const requested = Number(c.req.query("since"));
    const earliest = current - 24 * HOUR;
    const since = Number.isFinite(requested) && requested > earliest ? requested : earliest;
    return c.json(await loadActivity(db, c.get("context").city, since));
  });

  routes.get("/occurrences", async (c) => {
    const cityId = c.get("context").city.city.id;
    if (c.req.query("scope") === "recent") {
      return c.json(await listRecentOccurrences(db, cityId, now() - 24 * HOUR, 200));
    }
    return c.json(await listActiveOccurrences(db, cityId));
  });

  routes.get("/occurrences/heat", async (c) => {
    const days = Math.min(90, Math.max(1, Number(c.req.query("days")) || 30));
    const rows = await db.query<{ lng: number; lat: number }>(
      "SELECT lng, lat FROM occurrences WHERE city_id = $1 AND created_at >= $2",
      [c.get("context").city.city.id, now() - days * 24 * HOUR],
    );
    return c.json(rows.map((row) => [row.lng, row.lat]));
  });

  routes.post("/occurrences", async (c) => {
    const { city, hub, predictions } = c.get("context");
    const input = parseOccurrenceInput(await c.req.json(), city);
    const occurrence = await insertOccurrence(db, {
      ...input,
      cityId: city.city.id,
      equipmentId: null,
      source: "manual",
      createdAt: now(),
    });
    predictions.invalidate();
    await hub.publish({ occurrences: [occurrence] }, now());
    return c.json(occurrence, 201);
  });

  routes.post("/occurrences/:id/resolve", async (c) => {
    const { city, hub } = c.get("context");
    const id = parseId(c.req.param("id"));
    const occurrence = id === null ? null : await getOccurrence(db, city.city.id, id);
    if (!occurrence) {
      return c.json({ error: "Ocorrência não encontrada" }, 404);
    }
    if (occurrence.status !== "resolved") {
      await resolveOccurrence(db, occurrence.id, now());
      await db.run(
        "UPDATE agents SET status = 'available', occurrence_id = NULL WHERE occurrence_id = $1",
        [occurrence.id],
      );
    }
    const updated = (await getOccurrence(db, city.city.id, occurrence.id))!;
    await hub.publish({ occurrences: [updated] }, now());
    return c.json(updated);
  });

  routes.post("/alerts/:id/ack", async (c) => {
    const { hub } = c.get("context");
    await hub.acknowledge(c.req.param("id"), now());
    await hub.publish({}, now());
    return c.body(null, 204);
  });

  routes.delete("/alerts/:id/ack", async (c) => {
    const { hub } = c.get("context");
    await hub.unacknowledge(c.req.param("id"));
    await hub.publish({}, now());
    return c.body(null, 204);
  });

  return routes;
}
