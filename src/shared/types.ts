import type {
  Agency,
  AgentRole,
  AgentStatus,
  EquipmentStatus,
  EquipmentType,
  MaintenanceNeed,
  OccurrenceKind,
  Severity,
  Shift,
} from "./catalog.ts";
import type { LngLat } from "./geo.ts";

export type AttributeValue = string | number | boolean;

export type Equipment = {
  id: number;
  type: EquipmentType;
  serialNumber: string;
  brand: string;
  model: string;
  agency: Agency;
  status: EquipmentStatus;
  cep: string;
  street: string;
  reference: string;
  neighborhoodId: string;
  city: string;
  uf: string;
  lat: number;
  lng: number;
  currentLat: number | null;
  currentLng: number | null;
  maintenanceNeed: MaintenanceNeed;
  maintenanceIntervalDays: number | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  maintenanceNotes: string;
  attributes: Record<string, AttributeValue>;
  installedAt: string | null;
  lastSeenAt: string | null;
  battery: number | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentInput = Omit<
  Equipment,
  "id" | "createdAt" | "updatedAt" | "lastSeenAt" | "currentLat" | "currentLng" | "battery"
>;

export type Agent = {
  id: number;
  name: string;
  badge: string;
  role: AgentRole;
  agency: Agency;
  rank: string;
  phone: string;
  shift: Shift;
  status: AgentStatus;
  baseName: string;
  baseNeighborhoodId: string;
  lat: number;
  lng: number;
  vehicleId: number | null;
  occurrenceId: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentInput = Omit<
  Agent,
  "id" | "createdAt" | "updatedAt" | "lastSeenAt" | "occurrenceId" | "agency"
>;

export type OccurrenceStatus = "open" | "responding" | "resolved";

export type Occurrence = {
  id: number;
  kind: OccurrenceKind;
  severity: Severity;
  status: OccurrenceStatus;
  neighborhoodId: string;
  lat: number;
  lng: number;
  description: string;
  equipmentId: number | null;
  agentId: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type AlertLevel = "critical" | "warning" | "info";

export type AlertCategory =
  | "equipment"
  | "maintenance"
  | "telemetry"
  | "occurrence"
  | "region"
  | "anomaly"
  | "staffing";

export type Alert = {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  title: string;
  detail: string;
  target: { kind: "equipment" | "agent" | "occurrence" | "neighborhood"; id: string } | null;
  lat: number | null;
  lng: number | null;
  since: string;
  acknowledged: boolean;
};

export type Kpis = {
  equipmentTotal: number;
  operational: number;
  unavailable: number;
  notInstalled: number;
  disabled: number;
  availabilityPct: number;
  agentsActive: number;
  agentsOnDuty: number;
  agentsTotal: number;
  openOccurrences: number;
  criticalAlerts: number;
  maintenanceUrgent: number;
  maintenanceSoon: number;
};

export type HealthLevel = "normal" | "attention" | "critical";

export type AreaHealth = {
  id: string;
  name: string;
  equipmentTotal: number;
  operational: number;
  unavailable: number;
  availabilityPct: number;
  openOccurrences: number;
  severeOccurrences: number;
  agentsActive: number;
  level: HealthLevel;
  reasons: string[];
};

export type CityHealth = {
  level: HealthLevel;
  reasons: string[];
};

export type OperationsSummary = {
  generatedAt: string;
  city: CityHealth;
  kpis: Kpis;
  regions: AreaHealth[];
  neighborhoods: AreaHealth[];
  alerts: Alert[];
};

export type OperationsSnapshot = OperationsSummary & {
  equipment: Equipment[];
  agents: Agent[];
  occurrences: Occurrence[];
};

export type AgentPosition = Pick<Agent, "id" | "lat" | "lng" | "status" | "occurrenceId">;
export type EquipmentPosition = { id: number; lat: number; lng: number; battery: number | null };

export type StreamTick = {
  summary: OperationsSummary;
  agents: AgentPosition[];
  agentRecords: Agent[];
  movingEquipment: EquipmentPosition[];
  equipment: Equipment[];
  occurrences: Occurrence[];
  removedEquipment: number[];
  removedAgents: number[];
};

export type Region = { id: string; name: string; polygon: LngLat[] };

export type Neighborhood = {
  id: string;
  name: string;
  regionId: string;
  lat: number;
  lng: number;
  polygon: LngLat[];
};

export type Street = {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  neighborhoodId: string;
  cep: string;
};

export type PointOfInterest = {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  neighborhoodId: string;
};

export type CityDataset = {
  source: string;
  generatedAt: string;
  city: { name: string; uf: string; center: LngLat; boundary: LngLat[] };
  regions: Region[];
  neighborhoods: Neighborhood[];
  streets: Street[];
  pois: PointOfInterest[];
};

export type Meta = {
  city: CityDataset["city"];
  regions: Region[];
  neighborhoods: Neighborhood[];
  serverTime: string;
  liveMultiplier: number;
};

export type AddressLookup = {
  cep: string;
  street: string;
  neighborhoodId: string | null;
  neighborhoodName: string;
  city: string;
  uf: string;
  lat: number | null;
  lng: number | null;
  source: "local" | "viacep";
};

export type RiskLevel = "normal" | "above" | "well_above";

export type NeighborhoodRisk = {
  neighborhoodId: string;
  name: string;
  regionId: string;
  ratio: number;
  level: RiskLevel;
  expected: number;
  range: [number, number];
  chanceAny: number;
  peakHour: number;
  hourly: number[];
  topKinds: { kind: OccurrenceKind; expected: number }[];
  coveragePenalty: number;
  trendPct: number;
};

export type RiskForecast = {
  generatedAt: string;
  horizonHours: number;
  startHour: number;
  neighborhoods: NeighborhoodRisk[];
  cityHourly: number[];
  weeklyPattern: number[][];
};

export type StaffingRecommendation = {
  regionId: string;
  regionName: string;
  expectedOccurrences: number;
  workloadHours: number;
  requiredAgents: number;
  activeAgents: number;
  gap: number;
  peakWindow: string;
  action: string;
};

export type StaffingPlan = {
  generatedAt: string;
  horizonHours: number;
  regions: StaffingRecommendation[];
  moves: { fromRegionId: string; toRegionId: string; agents: number }[];
};

export type AnomalyKind = "flow_drop" | "flow_spike" | "silent_device" | "occurrence_spike";

export type Anomaly = {
  id: string;
  kind: AnomalyKind;
  title: string;
  detail: string;
  score: number;
  observed: number;
  expected: number;
  equipmentId: number | null;
  neighborhoodId: string | null;
  detectedAt: string;
};

export type FailureRisk = {
  equipmentId: number;
  serialNumber: string;
  type: EquipmentType;
  neighborhoodId: string;
  probability7d: number;
  daysOverdue: number;
  recentFailures: number;
  factors: string[];
  recommendation: string;
};

export type FailureRiskReport = {
  generatedAt: string;
  baselineDailyRate: Record<string, number>;
  overdueHazardRatio: number;
  items: FailureRisk[];
};

export type TrendSeries = {
  key: string;
  label: string;
  days: string[];
  values: number[];
  slopePerWeek: number;
  projection: { day: string; value: number; low: number; high: number }[];
};

export type TrendReport = {
  generatedAt: string;
  availability: TrendSeries[];
  occurrences: TrendSeries[];
  usage: TrendSeries[];
  insights: string[];
};

export type BacktestResult = {
  generatedAt: string;
  days: number;
  modelMae: number;
  baselineMae: number;
  improvementPct: number;
  topHitRate: number;
  baselineTopHitRate: number;
  evaluatedCells: number;
};
