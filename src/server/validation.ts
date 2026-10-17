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
import type { AgentInput, AttributeValue, EquipmentInput } from "../shared/types.ts";
import { neighborhoodsById } from "./city.ts";

export const AREA_BOUNDS = { south: -22.45, north: -22.05, west: -50.15, east: -49.75 };

export type ValidationIssue = { path: string; message: string };

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super("Dados inválidos");
    this.issues = issues;
  }
}

const REQUIRED = "Campo obrigatório";

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: REQUIRED })
    .trim()
    .min(1, { error: REQUIRED })
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

const latitude = z
  .number({ error: "Latitude inválida" })
  .min(AREA_BOUNDS.south, { error: "Coordenadas fora da área de Marília" })
  .max(AREA_BOUNDS.north, { error: "Coordenadas fora da área de Marília" });

const longitude = z
  .number({ error: "Longitude inválida" })
  .min(AREA_BOUNDS.west, { error: "Coordenadas fora da área de Marília" })
  .max(AREA_BOUNDS.east, { error: "Coordenadas fora da área de Marília" });

const neighborhoodId = z
  .string({ error: REQUIRED })
  .refine((value) => neighborhoodsById.has(value), { error: "Bairro não cadastrado" });

const cep = z
  .string({ error: REQUIRED })
  .trim()
  .regex(/^\d{5}-?\d{3}$/, { error: "CEP deve ter 8 dígitos" })
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
    serialNumber: text("Número de série", 3, 40),
    brand: text("Marca", 1, 60),
    model: text("Modelo", 1, 60),
    agency: z.enum(AGENCIES, { error: "Órgão responsável inválido" }),
    status: z.enum(EQUIPMENT_STATUSES, { error: "Situação inválida" }),
    cep,
    street: text("Rua", 2, 120),
    reference: text("Referência", 1, 120),
    neighborhoodId,
    city: text("Cidade", 2, 60).default("Marília"),
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
  name: text("Nome", 3, 80),
  badge: text("Matrícula", 2, 20),
  role: z.enum(AGENT_ROLE_KEYS as [(typeof AGENT_ROLE_KEYS)[number], ...typeof AGENT_ROLE_KEYS], {
    error: "Função inválida",
  }),
  rank: optionalText("Graduação", 40),
  phone: optionalText("Telefone", 20),
  shift: z.enum(SHIFT_KEYS as [(typeof SHIFT_KEYS)[number], ...typeof SHIFT_KEYS], {
    error: "Turno inválido",
  }),
  status: z.enum(AGENT_STATUSES, { error: "Situação inválida" }),
  baseName: text("Base", 2, 80),
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
  description: text("Descrição", 3, 200),
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
