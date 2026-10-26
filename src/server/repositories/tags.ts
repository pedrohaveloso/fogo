import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { EQUIPMENT_TYPES } from "../../shared/catalog.ts";
import type { CreatedTag, Tag, TagTarget } from "../../shared/types.ts";
import type { Database } from "../db.ts";
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

export function targetExists(db: Database, target: TagTarget): boolean {
  return target.kind === "equipment"
    ? getEquipment(db, target.id) !== null
    : getAgent(db, target.id) !== null;
}

export function tagFor(db: Database, target: TagTarget): Tag | null {
  const row = db.prepare(`SELECT * FROM tags WHERE ${column(target)} = ?`).get(target.id) as
    | TagRow
    | undefined;
  return row ? toTag(row) : null;
}

export function createTag(db: Database, target: TagTarget, now: number): CreatedTag {
  if (tagFor(db, target)) {
    throw new TagTakenError();
  }
  const token = randomBytes(24).toString("base64url");
  const id = newTagId();
  db.prepare(
    `INSERT INTO tags (id, token_hash, equipment_id, agent_id, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    id,
    hashToken(token).toString("hex"),
    target.kind === "equipment" ? target.id : null,
    target.kind === "agent" ? target.id : null,
    now,
  );
  return { tag: tagFor(db, target)!, token };
}

export function deleteTag(db: Database, id: string): boolean {
  return Number(db.prepare("DELETE FROM tags WHERE id = ?").run(id).changes) > 0;
}

export function authenticateTag(db: Database, id: string, token: string): Tag | null {
  const row = db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow | undefined;
  const expected = row ? Buffer.from(row.token_hash, "hex") : hashToken("");
  const matches = timingSafeEqual(expected, hashToken(token));
  return row && matches ? toTag(row) : null;
}

export function trackedIds(db: Database): { equipment: Set<number>; agents: Set<number> } {
  const rows = db.prepare("SELECT equipment_id, agent_id FROM tags").all() as Pick<
    TagRow,
    "equipment_id" | "agent_id"
  >[];
  return {
    equipment: new Set(
      rows.flatMap((row) => (row.equipment_id === null ? [] : [row.equipment_id])),
    ),
    agents: new Set(rows.flatMap((row) => (row.agent_id === null ? [] : [row.agent_id]))),
  };
}

export function reportLocation(
  db: Database,
  tag: Tag,
  report: LocationReport,
  now: number,
): ReportResult {
  const at = Math.min(report.at ?? now, now);
  const last = tag.lastReportAt === null ? null : Date.parse(tag.lastReportAt);
  if (last !== null && at < last) {
    return { applied: false };
  }
  const { target } = tag;
  if (target.kind === "agent") {
    db.prepare("UPDATE agents SET lat = ?, lng = ?, last_seen_at = ? WHERE id = ?").run(
      report.lat,
      report.lng,
      at,
      target.id,
    );
  } else {
    const equipment = getEquipment(db, target.id);
    const mobile = equipment !== null && EQUIPMENT_TYPES[equipment.type].mobile;
    db.prepare(
      `UPDATE equipment SET last_seen_at = ?, battery = COALESCE(?, battery),
       current_lat = CASE WHEN ? THEN ? ELSE current_lat END,
       current_lng = CASE WHEN ? THEN ? ELSE current_lng END WHERE id = ?`,
    ).run(at, report.battery, mobile ? 1 : 0, report.lat, mobile ? 1 : 0, report.lng, target.id);
  }
  db.prepare("UPDATE tags SET last_report_at = ? WHERE id = ?").run(at, tag.id);
  return { applied: true, target, at };
}
