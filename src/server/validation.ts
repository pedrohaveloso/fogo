import { z } from "zod";
import {
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
import { boundsOf, isSimplePolygon, pointInPolygon, type LngLat } from "../shared/geo.ts";
import { isStateCode } from "../shared/states.ts";
import {
  USER_ROLES,
  type AgentInput,
  type AttributeValue,
  type CityDataset,
  type EquipmentInput,
  type TagTarget,
} from "../shared/types.ts";
import { findNeighborhood } from "./city.ts";
import type { LocationReport } from "./repositories/tags.ts";

const SHAPE_MARGIN_DEGREES = 0.05;

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

const latitude = z
  .number({ error: "Clique no mapa ou digite a latitude" })
  .min(-90, { error: "Latitude fora do intervalo de -90 a 90" })
  .max(90, { error: "Latitude fora do intervalo de -90 a 90" });

const longitude = z
  .number({ error: "Clique no mapa ou digite a longitude" })
  .min(-180, { error: "Longitude fora do intervalo de -180 a 180" })
  .max(180, { error: "Longitude fora do intervalo de -180 a 180" });

const neighborhoodIdIn = (city: CityDataset | undefined) =>
  z
    .string({ error: "Selecione o bairro" })
    .refine((value) => city === undefined || findNeighborhood(city, value) !== undefined, {
      error: (issue) =>
        issue.input === "" ? "Selecione o bairro" : "Selecione um bairro da lista",
    });

const agencyIdIn = (city: CityDataset | undefined) =>
  z
    .number({ error: "Selecione o órgão responsável" })
    .int({ error: "Selecione o órgão responsável" })
    .refine((value) => city === undefined || city.agencies.some((item) => item.id === value), {
      error: "Selecione um órgão da lista",
    });

function insideCity(city: CityDataset | undefined) {
  return (value: { lat: number; lng: number }, ctx: z.RefinementCtx) => {
    if (city && !pointInPolygon([value.lng, value.lat], city.city.boundary)) {
      ctx.addIssue({
        code: "custom",
        path: ["lat"],
        message: `Escolha um ponto dentro de ${city.city.name}, clicando no mapa`,
      });
    }
  };
}

type CityLookup = (id: number) => CityDataset | undefined;

function cityFromInput(raw: unknown, cityOf: CityLookup): CityDataset | undefined {
  const id = typeof raw === "object" && raw !== null ? (raw as { cityId?: unknown }).cityId : null;
  return typeof id === "number" ? cityOf(id) : undefined;
}

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

const equipmentSchema = (city: CityDataset | undefined) =>
  z
    .object({
      cityId: z
        .number({ error: "Selecione a cidade" })
        .refine(() => city !== undefined, { error: "Selecione uma cidade da lista" }),
      type: z.enum(EQUIPMENT_TYPE_KEYS as [EquipmentType, ...EquipmentType[]], {
        error: "Tipo de equipamento inválido",
      }),
      serialNumber: text("Número de série", 3, 40, "Digite o número de série"),
      brand: text("Marca", 1, 60, "Digite a marca"),
      model: text("Modelo", 1, 60, "Digite o modelo"),
      agencyId: agencyIdIn(city),
      status: z.enum(EQUIPMENT_STATUSES, { error: "Situação inválida" }),
      cep,
      street: text("Rua", 2, 120, "Digite a rua"),
      reference: text("Referência", 1, 120, "Digite a referência, como número 181 ou S/N"),
      neighborhoodId: neighborhoodIdIn(city),
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
    .superRefine(insideCity(city))
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

export function parseEquipmentInput(raw: unknown, cityOf: CityLookup): EquipmentInput {
  const result = equipmentSchema(cityFromInput(raw, cityOf)).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return { ...result.data, attributes: parseAttributes(result.data.type, result.data.attributes) };
}

const agentSchema = (city: CityDataset) =>
  z
    .object({
      name: text("Nome", 3, 80, "Digite o nome do agente"),
      badge: text("Matrícula", 2, 20, "Digite a matrícula"),
      role: z.enum(
        AGENT_ROLE_KEYS as [(typeof AGENT_ROLE_KEYS)[number], ...typeof AGENT_ROLE_KEYS],
        {
          error: "Função inválida",
        },
      ),
      agencyId: agencyIdIn(city),
      rank: optionalText("Graduação", 40),
      phone: optionalText("Telefone", 20),
      shift: z.enum(SHIFT_KEYS as [(typeof SHIFT_KEYS)[number], ...typeof SHIFT_KEYS], {
        error: "Turno inválido",
      }),
      status: z.enum(AGENT_STATUSES, { error: "Situação inválida" }),
      baseName: text("Base", 2, 80, "Digite o nome da base"),
      baseNeighborhoodId: neighborhoodIdIn(city),
      lat: latitude,
      lng: longitude,
      vehicleId: z.number().int().positive().nullable().default(null),
    })
    .superRefine(insideCity(city));

export function parseAgentInput(raw: unknown, city: CityDataset): AgentInput {
  const result = agentSchema(city).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const occurrenceSchema = (city: CityDataset) =>
  z
    .object({
      kind: z.enum(
        OCCURRENCE_KIND_KEYS as [
          (typeof OCCURRENCE_KIND_KEYS)[number],
          ...typeof OCCURRENCE_KIND_KEYS,
        ],
        {
          error: "Tipo de ocorrência inválido",
        },
      ),
      severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
        error: "Gravidade inválida",
      }),
      neighborhoodId: neighborhoodIdIn(city),
      lat: latitude,
      lng: longitude,
      description: text("Descrição", 3, 200, "Descreva a ocorrência"),
    })
    .superRefine(insideCity(city));

export type OccurrenceInput = z.infer<ReturnType<typeof occurrenceSchema>>;

export function parseOccurrenceInput(raw: unknown, city: CityDataset): OccurrenceInput {
  const result = occurrenceSchema(city).safeParse(raw);
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

function polygonSchema(
  bounds: [LngLat, LngLat] | null,
  outside: string,
  subject: { required: string; few: string; many: string; crossing: string },
  maxPoints = MAX_SHAPE_POINTS,
) {
  const coordinate = (min: number, max: number) =>
    z
      .number({ error: "Cada ponto precisa de longitude e latitude" })
      .min(min, { error: outside })
      .max(max, { error: outside });
  const [[west, south], [east, north]] = bounds ?? [
    [-180, -90],
    [180, 90],
  ];
  return z
    .array(z.tuple([coordinate(west, east), coordinate(south, north)]), {
      error: subject.required,
    })
    .transform((points) => {
      const first = points[0];
      const last = points.at(-1);
      const closed =
        points.length > 1 && first && last && first[0] === last[0] && first[1] === last[1];
      return (closed ? points.slice(0, -1) : points).map(
        ([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))] as LngLat,
      );
    })
    .refine((points) => points.length >= 3, { error: subject.few })
    .refine((points) => points.length <= maxPoints, { error: subject.many })
    .refine((points) => points.length < 3 || isSimplePolygon(points), {
      error: subject.crossing,
    });
}

const NEIGHBORHOOD_SUBJECT = {
  required: "Envie a lista de pontos do bairro",
  few: "O bairro precisa de ao menos 3 pontos",
  many: `O bairro pode ter no máximo ${MAX_SHAPE_POINTS} pontos`,
  crossing: "As linhas do bairro não podem se cruzar",
};

function cityShapeBounds(city: CityDataset): [LngLat, LngLat] {
  const [[west, south], [east, north]] = boundsOf(city.city.boundary);
  return [
    [west - SHAPE_MARGIN_DEGREES, south - SHAPE_MARGIN_DEGREES],
    [east + SHAPE_MARGIN_DEGREES, north + SHAPE_MARGIN_DEGREES],
  ];
}

const shapeSchema = (city: CityDataset) =>
  z.object({
    polygon: polygonSchema(
      cityShapeBounds(city),
      `O desenho passou dos limites de ${city.city.name}`,
      NEIGHBORHOOD_SUBJECT,
    ),
  });

export function parseNeighborhoodShape(raw: unknown, city: CityDataset): LngLat[] {
  const result = shapeSchema(city).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data.polygon;
}

const name = (required: string, max = 80) =>
  z
    .string({ error: required })
    .trim()
    .min(2, { error: required })
    .max(max, { error: `Use no máximo ${max} caracteres` });

const neighborhoodDetailsSchema = (city: CityDataset) =>
  z.object({
    name: name("Digite o nome do bairro"),
    regionId: z
      .string({ error: "Selecione a zona" })
      .refine((value) => city.regions.some((region) => region.id === value), {
        error: (issue) => (issue.input === "" ? "Selecione a zona" : "Selecione uma zona da lista"),
      }),
  });

export type NeighborhoodDetails = z.infer<ReturnType<typeof neighborhoodDetailsSchema>>;

export function parseNeighborhoodDetails(raw: unknown, city: CityDataset): NeighborhoodDetails {
  const result = neighborhoodDetailsSchema(city).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const newNeighborhoodSchema = (city: CityDataset) =>
  neighborhoodDetailsSchema(city).extend(shapeSchema(city).shape);

export type NewNeighborhood = z.infer<ReturnType<typeof newNeighborhoodSchema>>;

export function parseNewNeighborhood(raw: unknown, city: CityDataset): NewNeighborhood {
  const result = newNeighborhoodSchema(city).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

function parseName(raw: unknown, required: string): string {
  const result = z.object({ name: name(required) }).safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data.name;
}

export function parseRegionName(raw: unknown): string {
  return parseName(raw, "Digite o nome da zona");
}

export function parseAgencyName(raw: unknown): string {
  return parseName(raw, "Digite o nome do órgão");
}

const MAX_BOUNDARY_POINTS = 5000;

const cityBoundarySchema = z.object({
  boundary: polygonSchema(
    null,
    "Ponto fora do mapa",
    {
      required: "Desenhe o limite da cidade no mapa",
      few: "O limite precisa de ao menos 3 pontos",
      many: "O limite tem pontos demais; simplifique o desenho",
      crossing: "As linhas do limite não podem se cruzar",
    },
    MAX_BOUNDARY_POINTS,
  ),
});

export function parseCityBoundary(raw: unknown): LngLat[] {
  const result = cityBoundarySchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data.boundary;
}

const newCitySchema = cityBoundarySchema.extend({
  center: z.tuple([longitude, latitude]).nullable().default(null),
  ibgeCode: z
    .number({ error: "Selecione o município" })
    .int({ error: "Selecione o município" })
    .min(1_000_000, { error: "Selecione o município" })
    .max(9_999_999, { error: "Selecione o município" }),
  name: name("Selecione o município", 120),
  uf: z.string({ error: "Selecione a UF" }).refine(isStateCode, { error: "Selecione a UF" }),
});

export type NewCity = z.infer<typeof newCitySchema>;

export function parseNewCity(raw: unknown): NewCity {
  const result = newCitySchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const USERNAME = /^[a-z0-9._-]+$/i;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

const password = (required: string) =>
  z
    .string({ error: required })
    .min(1, { error: required })
    .min(MIN_PASSWORD, { error: `A senha precisa ter ao menos ${MIN_PASSWORD} caracteres` })
    .max(MAX_PASSWORD, { error: `A senha pode ter no máximo ${MAX_PASSWORD} caracteres` });

const userSchema = z.object({
  username: z
    .string({ error: "Digite o usuário" })
    .trim()
    .min(1, { error: "Digite o usuário" })
    .min(3, { error: "O usuário precisa ter ao menos 3 caracteres" })
    .max(40, { error: "O usuário pode ter no máximo 40 caracteres" })
    .regex(USERNAME, { error: "Use só letras sem acento, números, ponto, hífen ou sublinhado" }),
  name: name("Digite o nome"),
  role: z.enum(USER_ROLES, { error: "Selecione o perfil" }),
  cityIds: z.array(z.number().int().positive()).default([]),
  password: password("Digite a senha").nullable().default(null),
});

export type UserInput = z.infer<typeof userSchema>;

export function parseUserInput(raw: unknown, requirePassword: boolean): UserInput {
  const result = userSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  if (requirePassword && result.data.password === null) {
    throw new ValidationError([{ path: "password", message: "Digite a senha" }]);
  }
  return result.data;
}

const loginSchema = z.object({
  username: z.string({ error: "Digite o usuário" }).trim().min(1, { error: "Digite o usuário" }),
  password: z
    .string({ error: "Digite a senha" })
    .min(1, { error: "Digite a senha" })
    .max(MAX_PASSWORD, { error: "Usuário ou senha incorretos" }),
});

export function parseLogin(raw: unknown): { username: string; password: string } {
  const result = loginSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

const passwordChangeSchema = z.object({
  current: z.string({ error: "Digite a senha atual" }).min(1, { error: "Digite a senha atual" }),
  next: password("Digite a nova senha"),
});

export function parsePasswordChange(raw: unknown): { current: string; next: string } {
  const result = passwordChangeSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data;
}

export function parseCityChoice(raw: unknown): number {
  const result = z
    .object({ cityId: z.number({ error: "Selecione a cidade" }).int().positive() })
    .safeParse(raw);
  if (!result.success) {
    throw new ValidationError(issuesFrom(result.error));
  }
  return result.data.cityId;
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
