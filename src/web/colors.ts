import type { AgentStatus, Severity } from "../shared/catalog.ts";
import type { AlertLevel, HealthLevel, RiskLevel } from "../shared/types.ts";

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  available: "#3987e5",
  responding: "#ec835a",
  break: "#898781",
  off_duty: "#4b5058",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  1: "#898781",
  2: "#fab219",
  3: "#ec835a",
  4: "#d03b3b",
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#3a4048",
  moderate: "#fab219",
  high: "#ec835a",
  critical: "#d03b3b",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Baixo",
  moderate: "Moderado",
  high: "Alto",
  critical: "Crítico",
};

export const HEALTH_COLORS: Record<HealthLevel, string> = {
  normal: "#0ca30c",
  attention: "#fab219",
  critical: "#d03b3b",
};

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  normal: "Normal",
  attention: "Atenção",
  critical: "Crítico",
};

export const ALERT_LABELS: Record<AlertLevel, string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Aviso",
};

export const SEQUENTIAL_BLUE = [
  "#13304f",
  "#184f95",
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
];
