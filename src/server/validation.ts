import { z } from "zod";
import {
  AGENCIES,
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_KEYS,
  MAINTENANCE_NEEDS,
  OCCURRENCE_KIND_KEYS,
  SHIFT_KEYS,
  type AttributeSpec,
  type EquipmentType,
} from "../shared/catalog.ts";
import { isSimplePolygon, type LngLat } from "../shared/geo.ts";
import type { AgentInput, AttributeValue, EquipmentInput, TagTarget } from "../shared/types.ts";
import { city, findNeighborhood } from "./city.ts";
import type { LocationReport } from "./repositories/tags.ts";

export const AREA_BOUNDS = { south: -22.45, north: -22.05, west: -50.15, east: -49.75 };

export type ValidationIssue = { path: string; message: string };

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super("Dados inválidos");
    this.issues = issues;
  }
}

const text = (label: string, min: number, max: number, required: string) =>
  z
    .string({ error: required })
    .trim()
    .min(1, { error: required })
    .refine((value) => value.length === 0 || value.length >= min, {
      error: `${label} precisa ter ao menos ${min} caracteres`,
    })
    .max(max, { error: `${label} pode ter no máximo ${max} caracteres` });

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} pode ter no máximo ${max} caracteres` })
    .default("");

const date = (label: string) =>
  z.iso.date({ error: `${label} deve estar no formato AAAA-MM-DD` }).nullable();

const OUTSIDE_AREA = "Escolha um ponto dentro de Marília, clicando no mapa";

const latitude = z
  .number({ error: "Clique no mapa ou digite a latitude" })
  .min(AREA_BOUNDS.south, { error: OUTSIDE_AREA })
  .max(AREA_BOUNDS.north, { error: OUTSIDE_AREA });

const longitude = z
  .number({ error: "Clique no mapa ou digite a longitude" })
  .min(AREA_BOUNDS.west, { error: OUTSIDE_AREA })
  .max(AREA_BOUNDS.east, { error: OUTSIDE_AREA });

const neighborhoodId = z
  .string({ error: "Selecione o bairro" })
  .refine((value) => findNeighborhood(value) !== undefined, {
    error: (issue) => (issue.input === "" ? "Selecione o bairro" : "Selecione um bairro da lista"),
  });

const cep = z
  .string({ error: "Digite o CEP" })
  .trim()
  .min(1, { error: "Digite o CEP" })
  .refine((value) => value === "" || /^\d{5}-?\d{3}$/.test(value), {
    error: "Digite o CEP com 8 números, como 17500-000",
  })
  .transform((value) => `${value.replace("-", "").slice(0, 5)}-${value.replace("-", "").slice(5)}`);

function attributeSchema(spec: AttributeSpec): z.ZodType<AttributeValue | undefined> {
  switch (spec.kind) {
    case "boolean":
      return z.boolean({ error: `${spec.label}: valor inválido` }).optional();
    case "number":
      return z
        .number({ error: `${spec.label}: informe um número` })
        .min(spec.min, { error: `${spec.label}: mínimo ${spec.min}` })
        .max(spec.max, { error: `${spec.label}: máximo ${spec.max}` })
        .optional();
    case "select":
      return z
        .enum(Object.keys(spec.options) as [string, ...string[]], {
          error: `${spec.label}: opção inválida`,
        })
        .optional();
    case "text":
      return z
        .string()
        .trim()
        .max(spec.maxLength, { error: `${spec.label}: no máximo ${spec.maxLength} caracteres` })
        .optional();
  }
}

export function parseAttributes(type: EquipmentType, raw: unknown): Record<string, AttributeValue> {
  const specs = EQUIPMENT_TYPES[type].attributes;
  const shape = Object.fromEntries(specs.map((spec) => [spec.key, attributeSchema(spec)]));
  const provided =
    raw !== null && typeof raw === "object"
      ? Object.fromEntries(
          Object.entries(raw).filter(([, value]) => value !== "" && value !== null),
        )
      : raw;
  const result = z.object(shape).safeParse(provided ?? {});
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: ["attributes", ...issue.path].join("."),
        message: issue.message,
      })),
    );
  }
  return Object.fromEntries(
    Object.entries(result.data).filter(
      (entry): entry is [string, AttributeValue] => entry[1] !== undefined,
    ),
  );
}

const equipmentSchema = z
  .object({
    type: z.enum(EQUIPMENT_TYPE_KEYS as [EquipmentType, ...EquipmentType[]], {
      error: "Tipo de equipamento inválido",
    }),
    serialNumber: text("Número de série", 3, 40, "Digite o número de série"),
    brand: text("Marca", 1, 60, "Digite a marca"),
    model: text("Modelo", 1, 60, "Digite o modelo"),
    agency: z.enum(AGENCIES, { error: "Órgão responsável inválido" }),
    status: z.enum(EQUIPMENT_STATUSES, { error: "Situação inválida" }),
    cep,
    street: text("Rua", 2, 120, "Digite a rua"),
    reference: text("Referência", 1, 120, "Digite a referência, como número 181 ou S/N"),
    neighborhoodId,
    city: text("Cidade", 2, 60, "Digite a cidade").default("Marília"),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, { error: "UF deve ter 2 letras" })
      .transform((value) => value.toUpperCase())
      .default("SP"),
    lat: latitude,
    lng: longitude,
    maintenanceNeed: z.enum(MAINTENANCE_NEEDS, { error: "Necessidade de manutenção inválida" }),
    maintenanceIntervalDays: z
      .number()
      .int({ error: "Intervalo deve ser um número inteiro de dias" })
      .min(1, { error: "Intervalo mínimo de 1 dia" })
      .max(1095, { error: "Intervalo máximo de 1095 dias" })
      .nullable()
      .default(null),
    lastMaintenanceAt: date("Última manutenção").default(null),
    nextMaintenanceAt: date("Próxima manutenção").default(null),
    maintenanceNotes: optionalText("Observações", 500),
    attributes: z.record(z.string(), z.unknown()).default({}),
    installedAt: date("Data de instalação").default(null),
  })
  .superRefine((value, ctx) => {
    if (value.maintenanceNeed === "scheduled" && value.nextMaintenanceAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["nextMaintenanceAt"],
        message: "Informe a data da próxima manutenção",
      });
    }
    if (value.status !== "not_installed" && value.installedAt === null) {
      ctx.addIssue({
        code: "custom",
        path: ["installedAt"],
        message: "Informe a data de instalação",
      });
    }
    if (value.status === "not_installed" && value.installedAt !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["installedAt"],
        message: "Equipamento ainda não instalado não pode ter data de instalação",
      });
    }
    if (
      value.lastMaintenanceAt &&
      value.nextMaintenanceAt &&
      value.nextMaintenanceAt < value.lastMaintenanceAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextMaintenanceAt"],
        message: "A próxima manutenção não pode ser anterior à última",
      });
    }
  });

function issuesFrom(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export function parseEquipmentInput(raw: unknown): EquipmentInput {
  const result = equipmentSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return { ...result.data, attributes: parseAttributes(result.data.type, result.data.attributes) };
}

const agentSchema = z.object({
  name: text("Nome", 3, 80, "Digite o nome do agente"),
  badge: text("Matrícula", 2, 20, "Digite a matrícula"),
  role: z.enum(AGENT_ROLE_KEYS as [(typeof AGENT_ROLE_KEYS)[number], ...typeof AGENT_ROLE_KEYS], {
    error: "Função inválida",
  }),
  rank: optionalText("Graduação", 40),
  phone: optionalText("Telefone", 20),
  shift: z.enum(SHIFT_KEYS as [(typeof SHIFT_KEYS)[number], ...typeof SHIFT_KEYS], {
    error: "Turno inválido",
  }),
  status: z.enum(AGENT_STATUSES, { error: "Situação inválida" }),
  baseName: text("Base", 2, 80, "Digite o nome da base"),
  baseNeighborhoodId: neighborhoodId,
  lat: latitude,
  lng: longitude,
  vehicleId: z.number().int().positive().nullable().default(null),
});

export function parseAgentInput(raw: unknown): AgentInput {
  const result = agentSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const occurrenceSchema = z.object({
  kind: z.enum(
    OCCURRENCE_KIND_KEYS as [(typeof OCCURRENCE_KIND_KEYS)[number], ...typeof OCCURRENCE_KIND_KEYS],
    {
      error: "Tipo de ocorrência inválido",
    },
  ),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
    error: "Gravidade inválida",
  }),
  neighborhoodId,
  lat: latitude,
  lng: longitude,
  description: text("Descrição", 3, 200, "Descreva a ocorrência"),
});

export type OccurrenceInput = z.infer<typeof occurrenceSchema>;

export function parseOccurrenceInput(raw: unknown): OccurrenceInput {
  const result = occurrenceSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

export function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const MAX_SHAPE_POINTS = 1000;

const shapePoint = z.tuple([
  z
    .number({ error: "Cada ponto precisa de longitude e latitude" })
    .min(AREA_BOUNDS.west, { error: "O desenho passou dos limites de Marília" })
    .max(AREA_BOUNDS.east, { error: "O desenho passou dos limites de Marília" }),
  z
    .number({ error: "Cada ponto precisa de longitude e latitude" })
    .min(AREA_BOUNDS.south, { error: "O desenho passou dos limites de Marília" })
    .max(AREA_BOUNDS.north, { error: "O desenho passou dos limites de Marília" }),
]);

const shapeSchema = z.object({
  polygon: z
    .array(shapePoint, { error: "Envie a lista de pontos do bairro" })
    .transform((points) => {
      const first = points[0];
      const last = points.at(-1);
      const closed =
        points.length > 1 && first && last && first[0] === last[0] && first[1] === last[1];
      return (closed ? points.slice(0, -1) : points).map(
        ([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as LngLat,
      );
    })
    .refine((points) => points.length >= 3, { error: "O bairro precisa de ao menos 3 pontos" })
    .refine((points) => points.length <= MAX_SHAPE_POINTS, {
      error: `O bairro pode ter no máximo ${MAX_SHAPE_POINTS} pontos`,
    })
    .refine((points) => points.length < 3 || isSimplePolygon(points), {
      error: "As linhas do bairro não podem se cruzar",
    }),
});

export function parseNeighborhoodShape(raw: unknown): LngLat[] {
  const result = shapeSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data.polygon;
}

const newNeighborhoodSchema = shapeSchema.extend({
  name: z
    .string({ error: "Digite o nome do bairro" })
    .trim()
    .min(2, { error: "Digite o nome do bairro" })
    .max(80, { error: "Use no máximo 80 caracteres" }),
  regionId: z
    .string({ error: "Selecione a região" })
    .refine((value) => city.regions.some((region) => region.id === value), {
      error: "Selecione uma região da lista",
    }),
});

export type NewNeighborhood = z.infer<typeof newNeighborhoodSchema>;

export function parseNewNeighborhood(raw: unknown): NewNeighborhood {
  const result = newNeighborhoodSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const tagTargetSchema = z.union(
  [
    z.object({ equipmentId: z.number().int().positive() }).strict(),
    z.object({ agentId: z.number().int().positive() }).strict(),
  ],
  { error: "Informe equipmentId ou agentId" },
);

export function parseTagTarget(raw: unknown): TagTarget {
  const result = tagTargetSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError([{ path: "target", message: "Informe equipmentId ou agentId" }]);
  }
  return "equipmentId" in result.data
    ? { kind: "equipment", id: result.data.equipmentId }
    : { kind: "agent", id: result.data.agentId };
}

const locationSchema = z.object({
  lat: z
    .number({ error: "Envie a latitude como número" })
    .min(-90, { error: "Latitude fora do intervalo de -90 a 90" })
    .max(90, { error: "Latitude fora do intervalo de -90 a 90" }),
  lng: z
    .number({ error: "Envie a longitude como número" })
    .min(-180, { error: "Longitude fora do intervalo de -180 a 180" })
    .max(180, { error: "Longitude fora do intervalo de -180 a 180" }),
  battery: z
    .number({ error: "Envie a bateria como número de 0 a 100" })
    .min(0, { error: "Bateria entre 0 e 100" })
    .max(100, { error: "Bateria entre 0 e 100" })
    .nullable()
    .default(null),
  at: z.iso
    .datetime({ offset: true, error: "Envie at em ISO 8601, como 2026-10-26T14:03:00Z" })
    .nullable()
    .default(null),
});

export function parseLocationReport(raw: unknown): LocationReport {
  const result = locationSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  const { at, ...rest } = result.data;
  return { ...rest, at: at === null ? null : Date.parse(at) };
}
