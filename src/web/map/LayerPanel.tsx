import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  AGENT_ROLE_KEYS,
  AGENT_ROLES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  EQUIPMENT_TYPES,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  type Severity,
} from "../../shared/catalog.ts";
import { SEVERITY_COLORS } from "../colors.ts";
import { AgentShield, HealthSwatch } from "../components/badges.tsx";
import { Glyph, SIGNAL_OFF_GLYPH, StatusShape, TYPE_GLYPHS, WRENCH_GLYPH } from "../icons.tsx";
import { MAINTENANCE_BADGE_COLOR, SILENT_BADGE_COLOR } from "./base.ts";
import { DARK_GLYPH, MAP_SURFACE, MARKER_RING } from "./palette.ts";
import type { MapLayers } from "./OperationsMap.tsx";

const SEVERITIES: Severity[] = [1, 2, 3, 4];

function BadgeKey({
  fill,
  ring,
  ink,
  glyph,
}: {
  fill: string;
  ring: string;
  ink: string;
  glyph: string;
}) {
  return (
    <svg viewBox="0 0 15 15" width={15} height={15} aria-hidden="true" focusable="false">
      <circle cx={7.5} cy={7.5} r={6} fill={fill} stroke={ring} strokeWidth={1.5} />
      <path
        d={glyph}
        transform="translate(3 3) scale(0.375)"
        fill="none"
        stroke={ink}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LayerItem({
  label,
  checked,
  onToggle,
  children,
}: {
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <li>
      <label className="check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {label}
      </label>
      {checked && <div className="layer-key">{children}</div>}
    </li>
  );
}

export function LayerPanel({
  layers,
  onChange,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
}) {
  const [open, setOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  useEffect(() => {
    document.documentElement.dataset["motion"] = motionPaused ? "paused" : "full";
  }, [motionPaused]);
  const toggle = (key: keyof MapLayers) => (checked: boolean) =>
    onChange({ ...layers, [key]: checked });

  return (
    <section className="map-overlay layer-panel" aria-label="Camadas e legenda do mapa">
      <button
        type="button"
        className="layer-panel-toggle"
        aria-expanded={open}
        aria-controls="map-layer-list"
        onClick={() => setOpen(!open)}
      >
        Camadas e legenda
      </button>
      {open && (
        <ul id="map-layer-list" className="layer-list">
          <LayerItem
            label="Situação dos bairros"
            checked={layers.health}
            onToggle={toggle("health")}
          >
            <span className="key">
              <HealthSwatch level="critical" />
              Crítico
            </span>
            <span className="key">
              <HealthSwatch level="attention" />
              Atenção
            </span>
          </LayerItem>
          <LayerItem label="Equipamentos" checked={layers.equipment} onToggle={toggle("equipment")}>
            <span className="key-group">Situação, pela forma e pela cor</span>
            {EQUIPMENT_STATUSES.map((status) => (
              <span key={status} className="key">
                <StatusShape status={status} color={STATUS_COLORS[status]} size={13} />
                {STATUS_LABELS[status]}
              </span>
            ))}
            <span className="key">
              <span className="cluster-key">8</span>
              Grupo de equipamentos
            </span>
            <span className="key">
              <span className="cluster-badge-key">2</span>
              Parados no grupo
            </span>
            <span className="key">
              <span className="cluster-maintenance-key">2</span>
              Manutenção urgente no grupo
            </span>
            <span className="key">
              <BadgeKey
                fill={MAINTENANCE_BADGE_COLOR}
                ring={MARKER_RING}
                ink={DARK_GLYPH}
                glyph={WRENCH_GLYPH}
              />
              Manutenção urgente (imediata ou vencida)
            </span>
            <span className="key">
              <BadgeKey
                fill={MAP_SURFACE}
                ring={MAINTENANCE_BADGE_COLOR}
                ink={DARK_GLYPH}
                glyph={WRENCH_GLYPH}
              />
              Manutenção nos próximos 7 dias
            </span>
            <span className="key">
              <BadgeKey
                fill={MAP_SURFACE}
                ring={SILENT_BADGE_COLOR}
                ink={SILENT_BADGE_COLOR}
                glyph={SIGNAL_OFF_GLYPH}
              />
              Sem comunicação há mais de 3 min
            </span>
            <span className="key-group">Tipo, pelo símbolo</span>
            {EQUIPMENT_TYPE_KEYS.map((type) => (
              <span key={type} className="key">
                <Glyph d={TYPE_GLYPHS[type]} size={14} />
                {EQUIPMENT_TYPES[type].label}
              </span>
            ))}
          </LayerItem>
          <LayerItem label="Agentes em serviço" checked={layers.agents} onToggle={toggle("agents")}>
            <span className="key-group">Função, pelo símbolo</span>
            {AGENT_ROLE_KEYS.map((role) => (
              <span key={role} className="key">
                <AgentShield status="available" role={role} size={16} />
                {AGENT_ROLES[role].label}
              </span>
            ))}
            <span className="key-group">Situação, pela cor</span>
            <span className="key">
              <AgentShield status="available" size={13} />
              Disponível
            </span>
            <span className="key">
              <AgentShield status="responding" size={13} />
              Em atendimento
            </span>
            <span className="key">
              <span className="dispatch-key" />
              Trajeto até a ocorrência
            </span>
          </LayerItem>
          <LayerItem
            label="Ocorrências abertas"
            checked={layers.occurrences}
            onToggle={toggle("occurrences")}
          >
            {SEVERITIES.map((severity) => (
              <span key={severity} className="key">
                <span
                  className="key-dot"
                  data-severity={severity}
                  style={{ "--key-color": SEVERITY_COLORS[severity] } as CSSProperties}
                />
                {SEVERITY_LABELS[severity]}
              </span>
            ))}
            <span className="key">
              <span className="key-dot key-pulse" />
              Aguardando equipe
            </span>
            <span className="key">
              <span className="key-dot" data-ring="true" />
              Equipe a caminho
            </span>
          </LayerItem>
          <LayerItem
            label="Mapa de calor (30 dias)"
            checked={layers.heat}
            onToggle={toggle("heat")}
          >
            <span className="key heat-key">
              menos
              <span className="heat-scale" />
              mais ocorrências
            </span>
          </LayerItem>
          <li>
            <label className="check">
              <input
                type="checkbox"
                checked={motionPaused}
                onChange={(event) => setMotionPaused(event.target.checked)}
              />
              Pausar animação
            </label>
          </li>
        </ul>
      )}
    </section>
  );
}
