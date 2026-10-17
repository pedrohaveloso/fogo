import {
  EQUIPMENT_TYPES,
  type Agency,
  type EquipmentStatus,
  type EquipmentType,
  type MaintenanceNeed,
} from "../../shared/catalog.ts";
import type { Equipment } from "../../shared/types.ts";

export type Draft = {
  type: EquipmentType;
  serialNumber: string;
  brand: string;
  model: string;
  agency: Agency;
  status: EquipmentStatus;
  installedAt: string;
  cep: string;
  street: string;
  reference: string;
  neighborhoodId: string;
  city: string;
  uf: string;
  lat: string;
  lng: string;
  maintenanceNeed: MaintenanceNeed;
  maintenanceIntervalDays: string;
  lastMaintenanceAt: string;
  nextMaintenanceAt: string;
  maintenanceNotes: string;
  attributes: Record<string, string | boolean>;
};

export const LABELS: Record<string, string> = {
  type: "Tipo",
  serialNumber: "Número de série",
  brand: "Marca",
  model: "Modelo",
  agency: "Órgão responsável",
  status: "Situação",
  installedAt: "Data de instalação",
  cep: "CEP",
  street: "Rua",
  reference: "Referência",
  neighborhoodId: "Bairro",
  city: "Cidade",
  uf: "UF",
  lat: "Latitude",
  lng: "Longitude",
  maintenanceNeed: "Necessidade de manutenção",
  maintenanceIntervalDays: "Periodicidade",
  lastMaintenanceAt: "Última manutenção",
  nextMaintenanceAt: "Próxima manutenção",
  maintenanceNotes: "Observações",
};

export const REFERENCE_SUGGESTIONS = [
  "número ",
  "oposto ao número ",
  "em frente ao ",
  "KM ",
  "S/N",
];

export function emptyDraft(type: EquipmentType): Draft {
  const spec = EQUIPMENT_TYPES[type];
  return {
    type,
    serialNumber: "",
    brand: "",
    model: "",
    agency: spec.defaultAgency,
    status: "not_installed",
    installedAt: "",
    cep: "",
    street: "",
    reference: "",
    neighborhoodId: "",
    city: "Marília",
    uf: "SP",
    lat: "",
    lng: "",
    maintenanceNeed: "none",
    maintenanceIntervalDays: String(spec.maintenanceIntervalDays),
    lastMaintenanceAt: "",
    nextMaintenanceAt: "",
    maintenanceNotes: "",
    attributes: {},
  };
}

export function fromEquipment(item: Equipment): Draft {
  return {
    type: item.type,
    serialNumber: item.serialNumber,
    brand: item.brand,
    model: item.model,
    agency: item.agency,
    status: item.status,
    installedAt: item.installedAt ?? "",
    cep: item.cep,
    street: item.street,
    reference: item.reference,
    neighborhoodId: item.neighborhoodId,
    city: item.city,
    uf: item.uf,
    lat: String(item.lat),
    lng: String(item.lng),
    maintenanceNeed: item.maintenanceNeed,
    maintenanceIntervalDays:
      item.maintenanceIntervalDays === null ? "" : String(item.maintenanceIntervalDays),
    lastMaintenanceAt: item.lastMaintenanceAt ?? "",
    nextMaintenanceAt: item.nextMaintenanceAt ?? "",
    maintenanceNotes: item.maintenanceNotes,
    attributes: Object.fromEntries(
      Object.entries(item.attributes).map(([key, value]) => [
        key,
        typeof value === "boolean" ? value : String(value),
      ]),
    ),
  };
}

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));
const toDate = (value: string) => (value === "" ? null : value);

export function toPayload(draft: Draft) {
  const attributes: Record<string, string | number | boolean> = {};
  for (const spec of EQUIPMENT_TYPES[draft.type].attributes) {
    const value = draft.attributes[spec.key];
    if (value === undefined || value === "") {
      continue;
    }
    attributes[spec.key] = spec.kind === "number" ? Number(String(value).replace(",", ".")) : value;
  }
  return {
    ...draft,
    lat: toNumber(draft.lat),
    lng: toNumber(draft.lng),
    installedAt: toDate(draft.installedAt),
    maintenanceIntervalDays: toNumber(draft.maintenanceIntervalDays),
    lastMaintenanceAt: toDate(draft.lastMaintenanceAt),
    nextMaintenanceAt: toDate(draft.nextMaintenanceAt),
    attributes,
  };
}
