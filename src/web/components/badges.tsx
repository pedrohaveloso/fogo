import {
  AGENT_STATUS_LABELS,
  EQUIPMENT_TYPES,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type AgentStatus,
  type EquipmentStatus,
  type EquipmentType,
  type Severity,
} from "../../shared/catalog.ts";
import type { HealthLevel, RiskLevel } from "../../shared/types.ts";
import {
  AGENT_STATUS_COLORS,
  HEALTH_COLORS,
  HEALTH_LABELS,
  RISK_COLORS,
  RISK_LABELS,
  SEVERITY_COLORS,
} from "../colors.ts";
import { AGENT_GLYPH, Glyph, StatusShape, TYPE_GLYPHS, shapePath } from "../icons.tsx";

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span className="badge">
      <StatusShape status={status} color={STATUS_COLORS[status]} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span className="badge">
      <svg viewBox="0 0 14 14" width={14} height={14} aria-hidden="true">
        <path d={shapePath("shield", 14)} fill={AGENT_STATUS_COLORS[status]} />
      </svg>
      {AGENT_STATUS_LABELS[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="badge">
      <span
        className="level-dot"
        style={{ background: SEVERITY_COLORS[severity], borderRadius: "50%" }}
      />
      Gravidade {SEVERITY_LABELS[severity].toLowerCase()}
    </span>
  );
}

export function HealthTag({ level }: { level: HealthLevel }) {
  return (
    <span className="level-tag">
      <span className="level-dot" style={{ background: HEALTH_COLORS[level] }} />
      {HEALTH_LABELS[level]}
    </span>
  );
}

export function RiskTag({ level }: { level: RiskLevel }) {
  return (
    <span className="level-tag">
      <span
        className="level-dot"
        style={{
          background: RISK_COLORS[level],
          outline: level === "low" ? "1px solid #6b7079" : undefined,
        }}
      />
      {RISK_LABELS[level]}
    </span>
  );
}

export function TypeLabel({ type }: { type: EquipmentType }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Glyph d={TYPE_GLYPHS[type]} size={18} />
      {EQUIPMENT_TYPES[type].label}
    </span>
  );
}

export function AgentGlyph() {
  return <Glyph d={AGENT_GLYPH} size={18} />;
}
