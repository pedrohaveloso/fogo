export function regionWith(preposition: "de" | "para", name: string): string {
  const masculine = !name.startsWith("Zona");
  if (preposition === "de") {
    return `${masculine ? "do" : "da"} ${name}`;
  }
  return `para ${masculine ? "o" : "a"} ${name}`;
}

export const EQUIPMENT_STATUSES = [
  "operational",
  "malfunction",
  "maintenance",
  "not_installed",
  "disabled",
  "stolen",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  operational: "Operacional",
  malfunction: "Mau funcionamento",
  maintenance: "Em manutenção",
  not_installed: "Ainda não instalado",
  disabled: "Desativado",
  stolen: "Furtado",
};

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  operational: "#0ca30c",
  malfunction: "#d03b3b",
  maintenance: "#fab219",
  not_installed: "#898781",
  disabled: "#6b7079",
  stolen: "#d55181",
};

export const MAINTENANCE_NEEDS = ["none", "scheduled", "immediate"] as const;
export type MaintenanceNeed = (typeof MAINTENANCE_NEEDS)[number];

export const MAINTENANCE_LABELS: Record<MaintenanceNeed, string> = {
  none: "Sem necessidade",
  scheduled: "Agendada/periódica",
  immediate: "Imediata",
};

export const AGENCIES = ["mobility", "municipal_guard", "military_police", "operator"] as const;
export type Agency = (typeof AGENCIES)[number];

export const AGENCY_LABELS: Record<Agency, string> = {
  mobility: "Secretaria de Mobilidade Urbana",
  municipal_guard: "Guarda Civil Municipal",
  military_police: "Polícia Militar",
  operator: "Operadora privada/concessionária",
};

export type AttributeSpec =
  | { key: string; label: string; kind: "boolean" }
  | { key: string; label: string; kind: "number"; unit?: string; min: number; max: number }
  | { key: string; label: string; kind: "select"; options: Record<string, string> }
  | { key: string; label: string; kind: "text"; maxLength: number };

export type EquipmentTypeSpec = {
  label: string;
  plural: string;
  mobile: boolean;
  defaultAgency: Agency;
  maintenanceIntervalDays: number;
  telemetry: "flow" | "usage" | "position" | "none";
  attributes: AttributeSpec[];
};

const PLATE: AttributeSpec = { key: "plate", label: "Placa", kind: "text", maxLength: 8 };

const EQUIPMENT_TYPE_SPECS = {
  radar: {
    label: "Radar de fiscalização",
    plural: "Radares",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 180,
    telemetry: "flow",
    attributes: [
      {
        key: "enforcement",
        label: "Fiscalização",
        kind: "select",
        options: {
          speed: "Velocidade",
          red_light: "Avanço de semáforo",
          forbidden_turn: "Conversão proibida",
          forbidden_u_turn: "Retorno proibido",
          bus_lane: "Faixa exclusiva de ônibus",
        },
      },
      {
        key: "speedLimit",
        label: "Velocidade máxima",
        kind: "number",
        unit: "km/h",
        min: 20,
        max: 120,
      },
      { key: "lanes", label: "Faixas monitoradas", kind: "number", min: 1, max: 6 },
      { key: "plateReader", label: "Leitura de placas (OCR)", kind: "boolean" },
    ],
  },
  camera: {
    label: "Câmera de videomonitoramento",
    plural: "Câmeras",
    mobile: false,
    defaultAgency: "municipal_guard",
    maintenanceIntervalDays: 120,
    telemetry: "flow",
    attributes: [
      { key: "nightVision", label: "Visão noturna", kind: "boolean" },
      {
        key: "resolution",
        label: "Resolução",
        kind: "select",
        options: { "720p": "HD (720p)", "1080p": "Full HD (1080p)", "4k": "4K" },
      },
      {
        key: "colorMode",
        label: "Imagem",
        kind: "select",
        options: { color: "Colorida", mono: "Preto e branco" },
      },
      { key: "ptz", label: "Movimentação remota (PTZ)", kind: "boolean" },
      { key: "plateReader", label: "Leitura de placas (OCR)", kind: "boolean" },
    ],
  },
  truck_scale: {
    label: "Balança de caminhão",
    plural: "Balanças",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 90,
    telemetry: "flow",
    attributes: [
      { key: "capacity", label: "Capacidade", kind: "number", unit: "t", min: 10, max: 120 },
      { key: "weighInMotion", label: "Pesagem em movimento", kind: "boolean" },
    ],
  },
  smart_traffic_light: {
    label: "Semáforo inteligente",
    plural: "Semáforos",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 150,
    telemetry: "flow",
    attributes: [
      { key: "phases", label: "Fases", kind: "number", min: 2, max: 8 },
      { key: "adaptive", label: "Tempo adaptativo", kind: "boolean" },
      { key: "pedestrianButton", label: "Botoeira para pedestres", kind: "boolean" },
    ],
  },
  automated_gate: {
    label: "Cancela automatizada",
    plural: "Cancelas",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 90,
    telemetry: "usage",
    attributes: [
      {
        key: "access",
        label: "Controle de acesso",
        kind: "select",
        options: { tag: "Tag", ticket: "Ticket", plate: "Leitura de placa" },
      },
    ],
  },
  parking_kiosk: {
    label: "Totem de estacionamento rotativo",
    plural: "Totens",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 60,
    telemetry: "usage",
    attributes: [
      { key: "acceptsPix", label: "Aceita Pix", kind: "boolean" },
      { key: "acceptsCard", label: "Aceita cartão", kind: "boolean" },
      { key: "spaces", label: "Vagas atendidas", kind: "number", min: 1, max: 400 },
    ],
  },
  parking_enforcement_vehicle: {
    label: "Veículo autônomo de fiscalização (rotativo)",
    plural: "Veículos autônomos",
    mobile: true,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 45,
    telemetry: "position",
    attributes: [
      PLATE,
      { key: "rangeKm", label: "Autonomia", kind: "number", unit: "km", min: 20, max: 600 },
      { key: "cameras", label: "Câmeras de leitura", kind: "number", min: 1, max: 8 },
    ],
  },
  transport_vehicle: {
    label: "Veículo de transporte",
    plural: "Veículos de transporte",
    mobile: true,
    defaultAgency: "operator",
    maintenanceIntervalDays: 180,
    telemetry: "position",
    attributes: [
      {
        key: "service",
        label: "Serviço",
        kind: "select",
        options: { taxi: "Táxi", mototaxi: "Mototáxi", school: "Transporte escolar" },
      },
      PLATE,
      { key: "seats", label: "Lugares", kind: "number", min: 1, max: 60 },
      { key: "permit", label: "Alvará", kind: "text", maxLength: 20 },
    ],
  },
  e_scooter: {
    label: "Patinete elétrico",
    plural: "Patinetes",
    mobile: true,
    defaultAgency: "operator",
    maintenanceIntervalDays: 30,
    telemetry: "position",
    attributes: [
      {
        key: "model",
        label: "Modalidade",
        kind: "select",
        options: { public: "Público", shared: "Compartilhado" },
      },
      { key: "operatorName", label: "Operadora", kind: "text", maxLength: 40 },
      {
        key: "maxSpeed",
        label: "Velocidade limitada",
        kind: "number",
        unit: "km/h",
        min: 6,
        max: 25,
      },
    ],
  },
  agent_motorcycle: {
    label: "Moto de agente de trânsito",
    plural: "Motos de agentes",
    mobile: true,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 60,
    telemetry: "position",
    attributes: [
      PLATE,
      { key: "engineCc", label: "Cilindrada", kind: "number", unit: "cc", min: 100, max: 1300 },
    ],
  },
  patrol_vehicle: {
    label: "Viatura",
    plural: "Viaturas",
    mobile: true,
    defaultAgency: "municipal_guard",
    maintenanceIntervalDays: 60,
    telemetry: "position",
    attributes: [
      PLATE,
      {
        key: "vehicleKind",
        label: "Tipo de viatura",
        kind: "select",
        options: {
          car: "Carro",
          pickup: "Caminhonete",
          motorcycle: "Motocicleta",
          van: "Van/base móvel",
        },
      },
      { key: "prefix", label: "Prefixo", kind: "text", maxLength: 12 },
    ],
  },
  variable_message_sign: {
    label: "Painel de mensagem variável",
    plural: "Painéis",
    mobile: false,
    defaultAgency: "mobility",
    maintenanceIntervalDays: 180,
    telemetry: "none",
    attributes: [
      { key: "lines", label: "Linhas de texto", kind: "number", min: 1, max: 6 },
      { key: "fullColor", label: "Colorido", kind: "boolean" },
    ],
  },
} as const satisfies Record<string, EquipmentTypeSpec>;

export type EquipmentType = keyof typeof EQUIPMENT_TYPE_SPECS;
export const EQUIPMENT_TYPES: Record<EquipmentType, EquipmentTypeSpec> = EQUIPMENT_TYPE_SPECS;
export const EQUIPMENT_TYPE_KEYS = Object.keys(EQUIPMENT_TYPES) as EquipmentType[];

export const AGENT_ROLES = {
  traffic_agent: { label: "Agente de trânsito", agency: "mobility" },
  municipal_guard: { label: "Guarda municipal", agency: "municipal_guard" },
  military_police: { label: "Policial militar", agency: "military_police" },
} as const satisfies Record<string, { label: string; agency: Agency }>;
export type AgentRole = keyof typeof AGENT_ROLES;
export const AGENT_ROLE_KEYS = Object.keys(AGENT_ROLES) as AgentRole[];

export const AGENT_STATUSES = ["available", "responding", "break", "off_duty"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  available: "Disponível",
  responding: "Em atendimento",
  break: "Em pausa",
  off_duty: "Fora de serviço",
};

export const ACTIVE_AGENT_STATUSES: readonly AgentStatus[] = ["available", "responding"];

export const SHIFTS = {
  morning: "Manhã (6h–14h)",
  afternoon: "Tarde (14h–22h)",
  night: "Noite (22h–6h)",
} as const;
export type Shift = keyof typeof SHIFTS;
export const SHIFT_KEYS = Object.keys(SHIFTS) as Shift[];

export function shiftCovers(shift: Shift, hour: number): boolean {
  switch (shift) {
    case "morning":
      return hour >= 6 && hour < 14;
    case "afternoon":
      return hour >= 14 && hour < 22;
    case "night":
      return hour >= 22 || hour < 6;
  }
}

export const OCCURRENCE_KINDS = {
  accident: { label: "Acidente de trânsito", handlingMinutes: 50, severityWeight: 3 },
  congestion: { label: "Congestionamento", handlingMinutes: 30, severityWeight: 1 },
  traffic_light_out: { label: "Semáforo apagado", handlingMinutes: 40, severityWeight: 2 },
  irregular_parking: { label: "Estacionamento irregular", handlingMinutes: 15, severityWeight: 1 },
  road_blocked: { label: "Via interditada", handlingMinutes: 60, severityWeight: 2 },
  public_safety: { label: "Ocorrência de segurança", handlingMinutes: 45, severityWeight: 3 },
  vandalism: { label: "Vandalismo em equipamento", handlingMinutes: 35, severityWeight: 2 },
} as const satisfies Record<
  string,
  { label: string; handlingMinutes: number; severityWeight: number }
>;
export type OccurrenceKind = keyof typeof OCCURRENCE_KINDS;
export const OCCURRENCE_KIND_KEYS = Object.keys(OCCURRENCE_KINDS) as OccurrenceKind[];

export const SEVERITY_LABELS = { 1: "Baixa", 2: "Média", 3: "Alta", 4: "Crítica" } as const;
export type Severity = keyof typeof SEVERITY_LABELS;

export const UNAVAILABLE_STATUSES: readonly EquipmentStatus[] = [
  "malfunction",
  "maintenance",
  "stolen",
];

export function countsTowardAvailability(status: EquipmentStatus): boolean {
  return status !== "not_installed" && status !== "disabled";
}
