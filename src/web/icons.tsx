import type { EquipmentStatus, EquipmentType } from "../shared/catalog.ts";

const CAR = "M3 17v-3.5l2-5h14l2 5V17z M6.5 17v2.5 M17.5 17v2.5 M3 13.5h18";

export const TYPE_GLYPHS: Record<EquipmentType, string> = {
  radar: "M4.5 16.5a7.5 7.5 0 0 1 15 0 M12 16.5l3.5-4.5 M4 19.5h16",
  camera: "M3 7.5h11v7H3z M14 10l6-3v8l-6-3 M7 14.5v5 M4.5 19.5h5",
  truck_scale:
    "M2.5 6.5h11v9h-11z M13.5 9.5h4l3 3.5v2.5h-7 M4.5 18a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0 M15 18a1.75 1.75 0 1 0 3.5 0a1.75 1.75 0 1 0 -3.5 0",
  smart_traffic_light:
    "M8 2.5h8v19H8z M10.5 7a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0 M10.5 17a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  automated_gate: "M5 21V4 M5 8.5h15.5v3H5 M9.5 8.5l-2 3 M14 8.5l-2 3 M18.5 8.5l-2 3 M2.5 21h5",
  parking_kiosk: "M8 20.5V3.5h5a4.5 4.5 0 0 1 0 9H8",
  parking_enforcement_vehicle: `${CAR} M10 4h4v4.5h-4z`,
  transport_vehicle: `${CAR} M9 5.5h6v3H9z`,
  e_scooter:
    "M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M8 18h8 M18 18L14.5 4.5h-3",
  agent_motorcycle:
    "M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M5 16l4-6h5l5 6 M12 10l-1-3H8.5",
  patrol_vehicle: `${CAR} M10 8.5V6.5a2 2 0 0 1 4 0v2`,
  variable_message_sign: "M3 4.5h18v11H3z M12 15.5v5.5 M6.5 8h11 M6.5 12h7",
};

export const AGENT_GLYPH = "M9 7.5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M6 19.5a6 6 0 0 1 12 0";

export function Glyph({ d, size = 18, label }: { d: string; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export type MarkerShape =
  | "circle"
  | "diamond"
  | "square"
  | "octagon"
  | "outline-circle"
  | "outline-square"
  | "shield";

export const STATUS_SHAPES: Record<EquipmentStatus, MarkerShape> = {
  operational: "circle",
  malfunction: "diamond",
  maintenance: "square",
  stolen: "octagon",
  not_installed: "outline-circle",
  disabled: "outline-square",
};

export function shapePath(shape: MarkerShape, size: number): string {
  const c = size / 2;
  const r = size / 2 - 2;
  switch (shape) {
    case "circle":
    case "outline-circle":
      return `M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    case "diamond":
      return `M${c} ${c - r - 1}L${c + r + 1} ${c}L${c} ${c + r + 1}L${c - r - 1} ${c}z`;
    case "square":
    case "outline-square": {
      const s = r * 0.88;
      return `M${c - s} ${c - s}h${2 * s}v${2 * s}h${-2 * s}z`;
    }
    case "octagon": {
      const points = Array.from({ length: 8 }, (_, index) => {
        const angle = (Math.PI / 8) * (2 * index + 1);
        return `${(c + r * Math.cos(angle)).toFixed(2)} ${(c + r * Math.sin(angle)).toFixed(2)}`;
      });
      return `M${points.join("L")}z`;
    }
    case "shield":
      return `M${c} ${c - r}L${c + r * 0.9} ${c - r * 0.55}V${c + r * 0.1}C${c + r * 0.9} ${c + r * 0.6} ${c + r * 0.45} ${c + r * 0.85} ${c} ${c + r}C${c - r * 0.45} ${c + r * 0.85} ${c - r * 0.9} ${c + r * 0.6} ${c - r * 0.9} ${c + r * 0.1}V${c - r * 0.55}z`;
  }
}

export function StatusShape({
  status,
  color,
  size = 14,
}: {
  status: EquipmentStatus;
  color: string;
  size?: number;
}) {
  const shape = STATUS_SHAPES[status];
  const outline = shape.startsWith("outline");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={shapePath(shape, size)}
        fill={outline ? "none" : color}
        stroke={color}
        strokeWidth={outline ? 1.6 : 0}
        strokeDasharray={shape === "outline-circle" ? "2.5 2" : undefined}
      />
    </svg>
  );
}
