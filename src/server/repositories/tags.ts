import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EQUIPMENT_TYPES } from "../../shared/catalog.ts";
import type { CreatedTag, Tag, TagTarget } from "../../shared/types.ts";
import type { Queryable } from "../db.ts";
import { getAgent } from "./agents.ts";
import { getEquipment } from "./equipment.ts";

type TagRow = {
  id: string;
  token_hash: string;
  equipment_id: number | null;
  agent_id: number | null;
  created_at: number;
  last_report_at: number | null;
};

export type LocationReport = {
  lat: number;
  lng: number;
  battery: number | null;
  at: number | null;
};

export type ReportResult = { applied: false } | { applied: true; target: TagTarget; at: number };

export class TagTakenError extends Error {}

const TAG_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TAG_ID_LENGTH = 8;

function newTagId(): string {
  const bytes = randomBytes(TAG_ID_LENGTH);
  return `TAG-${[...bytes].map((byte) => TAG_ALPHABET[byte % TAG_ALPHABET.length]).join("")}`;
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    target:
      row.equipment_id === null
        ? { kind: "agent", id: row.agent_id! }
        : { kind: "equipment", id: row.equipment_id },
    createdAt: new Date(row.created_at).toISOString(),
    lastReportAt: row.last_report_at === null ? null : new Date(row.last_report_at).toISOString(),
  };
}

function column(target: TagTarget): "equipment_id" | "agent_id" {
  return target.kind === "equipment" ? "equipment_id" : "agent_id";
}

export async function targetCityId(db: Queryable, target: TagTarget): Promise<number | null> {
  const owner =
    target.kind === "equipment" ? await getEquipment(db, target.id) : await getAgent(db, target.id);
  return owner?.cityId ?? null;
}

export async function getTag(db: Queryable, id: string): Promise<Tag | null> {
  const row = await db.one<TagRow>("SELECT * FROM tags WHERE id = $1", [id]);
  return row ? toTag(row) : null;
}

export async function tagFor(db: Queryable, target: TagTarget): Promise<Tag | null> {
  const row = await db.one<TagRow>(`SELECT * FROM tags WHERE ${column(target)} = $1`, [target.id]);
  return row ? toTag(row) : null;
}

export async function createTag(
  db: Queryable,
  target: TagTarget,
  now: number,
): Promise<CreatedTag> {
  if (await tagFor(db, target)) {
    throw new TagTakenError();
  }
  const token = randomBytes(24).toString("base64url");
  const id = newTagId();
  await db.run(
    "INSERT INTO tags (id, token_hash, equipment_id, agent_id, created_at) VALUES ($1, $2, $3, $4, $5)",
    [
      id,
      hashToken(token).toString("hex"),
      target.kind === "equipment" ? target.id : null,
      target.kind === "agent" ? target.id : null,
      now,
    ],
  );
  return { tag: (await tagFor(db, target))!, token };
}

export async function deleteTag(db: Queryable, id: string): Promise<boolean> {
  return (await db.run("DELETE FROM tags WHERE id = $1", [id])) > 0;
}

export async function authenticateTag(
  db: Queryable,
  id: string,
  token: string,
): Promise<Tag | null> {
  const row = await db.one<TagRow>("SELECT * FROM tags WHERE id = $1", [id]);
  const expected = row ? Buffer.from(row.token_hash, "hex") : hashToken("");
  const matches = timingSafeEqual(expected, hashToken(token));
  return row && matches ? toTag(row) : null;
}

export async function trackedIds(
  db: Queryable,
): Promise<{ equipment: Set<number>; agents: Set<number> }> {
  const rows = await db.query<Pick<TagRow, "equipment_id" | "agent_id">>(
    "SELECT equipment_id, agent_id FROM tags",
  );
  return {
    equipment: new Set(
      rows.flatMap((row) => (row.equipment_id === null ? [] : [row.equipment_id])),
    ),
    agents: new Set(rows.flatMap((row) => (row.agent_id === null ? [] : [row.agent_id]))),
  };
}

export async function reportLocation(
  db: Queryable,
  tag: Tag,
  report: LocationReport,
  now: number,
): Promise<ReportResult> {
  const at = Math.min(report.at ?? now, now);
  const last = tag.lastReportAt === null ? null : Date.parse(tag.lastReportAt);
  if (last !== null && at < last) {
    return { applied: false };
  }
  const { target } = tag;
  if (target.kind === "agent") {
    await db.run("UPDATE agents SET lat = $1, lng = $2, last_seen_at = $3 WHERE id = $4", [
      report.lat,
      report.lng,
      at,
      target.id,
    ]);
  } else {
    const equipment = await getEquipment(db, target.id);
    const mobile = equipment !== null && EQUIPMENT_TYPES[equipment.type].mobile;
    await db.run(
      `UPDATE equipment SET last_seen_at = $1, battery = COALESCE($2, battery),
       current_lat = CASE WHEN $3::boolean THEN $4::double precision ELSE current_lat END,
       current_lng = CASE WHEN $3::boolean THEN $5::double precision ELSE current_lng END WHERE id = $6`,
      [at, report.battery, mobile, report.lat, report.lng, target.id],
    );
  }
  await db.run("UPDATE tags SET last_report_at = $1 WHERE id = $2", [at, tag.id]);
  return { applied: true, target, at };
}
