import type { CSSProperties } from "react";
import {
  AGENT_STATUS_LABELS,
  EQUIPMENT_TYPES,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type AgentRole,
  type AgentStatus,
  type EquipmentStatus,
  type EquipmentType,
  type Severity,
} from "../../shared/catalog.ts";
import type { AlertLevel, HealthLevel, RiskLevel } from "../../shared/types.ts";
import {
  AGENT_STATUS_COLORS,
  ALERT_LABELS,
  HEALTH_COLORS,
  HEALTH_LABELS,
  RISK_LABELS,
  SEVERITY_COLORS,
} from "../colors.ts";
import { AGENT_ROLE_GLYPHS, Glyph, StatusShape, TYPE_GLYPHS, shapePath } from "../icons.tsx";

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span className="badge">
      <StatusShape status={status} color={STATUS_COLORS[status]} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function AgentShield({
  status,
  role,
  size = 14,
}: {
  status: AgentStatus;
  role?: AgentRole;
  size?: number;
}) {
  const glyphSize = size * 0.6;
  const offset = (size - glyphSize) / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <path d={shapePath("shield", size)} fill={AGENT_STATUS_COLORS[status]} />
      {role && (
        <path
          d={AGENT_ROLE_GLYPHS[role]}
          transform={`translate(${offset} ${offset}) scale(${glyphSize / 24})`}
          fill="none"
          stroke={status === "responding" ? "#1b1f24" : "#ffffff"}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span className="badge">
      <AgentShield status={status} />
      {AGENT_STATUS_LABELS[status]}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="badge">
      <span
        className="key-dot"
        style={{ "--key-color": SEVERITY_COLORS[severity] } as CSSProperties}
      />
      Gravidade {SEVERITY_LABELS[severity].toLowerCase()}
    </span>
  );
}

export function HealthSwatch({ level }: { level: HealthLevel }) {
  if (level === "critical") {
    return <span className="swatch" data-pattern="zebra" />;
  }
  if (level === "attention") {
    return <span className="swatch" data-pattern="lane" />;
  }
  return <span className="swatch" style={{ background: HEALTH_COLORS.normal }} />;
}

export function HealthTag({ level }: { level: HealthLevel }) {
  return (
    <span className="level-tag">
      <HealthSwatch level={level} />
      {HEALTH_LABELS[level]}
    </span>
  );
}

const RISK_PATTERNS: Record<RiskLevel, string> = {
  well_above: "zebra",
  above: "lane",
  normal: "hairline",
};

export function RiskSwatch({ level }: { level: RiskLevel }) {
  return <span className="swatch" data-pattern={RISK_PATTERNS[level]} />;
}

export function RiskTag({ level }: { level: RiskLevel }) {
  return (
    <span className="level-tag">
      <RiskSwatch level={level} />
      {RISK_LABELS[level]}
    </span>
  );
}

export function LevelPlate({ level }: { level: AlertLevel }) {
  return (
    <span className="plate" data-level={level}>
      {ALERT_LABELS[level]}
    </span>
  );
}

export function Meter({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const width = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <span className="meter" role="presentation" style={{ "--meter-color": color } as CSSProperties}>
      <span style={{ width: `${width}%` }} />
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
