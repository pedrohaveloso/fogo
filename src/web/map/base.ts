import type { LngLat } from "../../shared/geo.ts";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AGENT_ROLE_KEYS,
  AGENT_STATUSES,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPE_KEYS,
  STATUS_COLORS,
} from "../../shared/catalog.ts";
import { AGENT_STATUS_COLORS } from "../colors.ts";
import {
  AGENT_ROLE_GLYPHS,
  STATUS_SHAPES,
  TYPE_GLYPHS,
  SIGNAL_OFF_GLYPH,
  WRENCH_GLYPH,
  shapePath,
  type MarkerShape,
} from "../icons.tsx";
import { tintBasemap } from "./basemap.ts";

setWorkerUrl(workerUrl);

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const STYLE_TIMEOUT_MS = 5000;
const MARKER_SIZE = 30;
const PIXEL_RATIO = 2;
const HATCH_TILE = 10;
const RING = "#111417";

export const CRITICAL_HATCH = "hatch-critical";

const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": RING } }],
};

let stylePromise: Promise<{ style: StyleSpecification; online: boolean }> | null = null;

function loadStyle(): Promise<{ style: StyleSpecification; online: boolean }> {
  stylePromise ??= fetch(MAP_STYLE_URL, { signal: AbortSignal.timeout(STYLE_TIMEOUT_MS) })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      return { style: tintBasemap((await response.json()) as StyleSpecification), online: true };
    })
    .catch(() => {
      stylePromise = null;
      return { style: FALLBACK_STYLE, online: false };
    });
  return stylePromise;
}

function darkInk(color: string): boolean {
  return color === STATUS_COLORS.maintenance;
}

function drawMarker(
  shape: MarkerShape,
  fill: string,
  glyph: string,
  glyphColor: string,
): ImageData {
  const size = MARKER_SIZE * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.scale(PIXEL_RATIO, PIXEL_RATIO);
  const outline = shape.startsWith("outline");
  const path = new Path2D(shapePath(shape, MARKER_SIZE));

  context.lineJoin = "round";
  context.strokeStyle = RING;
  context.lineWidth = 4;
  context.stroke(path);
  context.fillStyle = outline ? "#1f2328" : fill;
  context.fill(path);
  if (outline) {
    context.strokeStyle = fill;
    context.lineWidth = 2;
    context.setLineDash(shape === "outline-circle" ? [3, 2.5] : []);
    context.stroke(path);
    context.setLineDash([]);
  }

  const glyphSize = 15;
  const offset = (MARKER_SIZE - glyphSize) / 2;
  context.save();
  context.translate(offset, offset);
  context.scale(glyphSize / 24, glyphSize / 24);
  context.strokeStyle = glyphColor;
  context.lineWidth = 2.4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(glyph));
  context.restore();
  return context.getImageData(0, 0, size, size);
}

function drawHatch(color: string): ImageData {
  const size = HATCH_TILE * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.strokeStyle = color;
  context.lineWidth = 1.6 * PIXEL_RATIO;
  context.beginPath();
  for (const offset of [-size, 0, size]) {
    context.moveTo(offset - 1, size + 1);
    context.lineTo(offset + size + 1, -1);
  }
  context.stroke();
  return context.getImageData(0, 0, size, size);
}

export function equipmentImageId(type: string, status: string): string {
  return `equipment-${type}-${status}`;
}

export function agentImageId(role: string, status: string): string {
  return `agent-${role}-${status}`;
}

export const MAINTENANCE_BADGE_COLOR = "#fab219";

export const NEIGHBORHOOD_ATTRIBUTION =
  'Bairros com limites aproximados a partir do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>';

export const SILENT_BADGE_COLOR = "#c1c7ce";

function drawBadge(fill: string, ring: string, ink: string, glyph: string): ImageData {
  const badge = 15;
  const size = badge * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.scale(PIXEL_RATIO, PIXEL_RATIO);
  context.beginPath();
  context.arc(badge / 2, badge / 2, badge / 2 - 1.5, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = ring;
  context.stroke();
  const glyphSize = 9;
  context.translate((badge - glyphSize) / 2, (badge - glyphSize) / 2);
  context.scale(glyphSize / 24, glyphSize / 24);
  context.strokeStyle = ink;
  context.lineWidth = 3.2;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(glyph));
  return context.getImageData(0, 0, size, size);
}

function registerImages(map: MapLibreMap): void {
  const ratio = { pixelRatio: PIXEL_RATIO };
  map.addImage(
    "maintenance-urgent",
    drawBadge(MAINTENANCE_BADGE_COLOR, RING, "#1b1f24", WRENCH_GLYPH),
    ratio,
  );
  map.addImage(
    "maintenance-soon",
    drawBadge("#1f2328", MAINTENANCE_BADGE_COLOR, MAINTENANCE_BADGE_COLOR, WRENCH_GLYPH),
    ratio,
  );
  map.addImage(
    "signal-off",
    drawBadge("#1f2328", SILENT_BADGE_COLOR, SILENT_BADGE_COLOR, SIGNAL_OFF_GLYPH),
    ratio,
  );
  map.addImage(CRITICAL_HATCH, drawHatch("rgba(208, 59, 59, 0.9)"), { pixelRatio: PIXEL_RATIO });
  for (const type of EQUIPMENT_TYPE_KEYS) {
    for (const status of EQUIPMENT_STATUSES) {
      const color = STATUS_COLORS[status];
      const shape = STATUS_SHAPES[status];
      const glyphColor = shape.startsWith("outline")
        ? "#c1c7ce"
        : darkInk(color)
          ? "#1b1f24"
          : "#ffffff";
      map.addImage(
        equipmentImageId(type, status),
        drawMarker(shape, color, TYPE_GLYPHS[type], glyphColor),
        {
          pixelRatio: PIXEL_RATIO,
        },
      );
    }
  }
  for (const role of AGENT_ROLE_KEYS) {
    for (const status of AGENT_STATUSES) {
      map.addImage(
        agentImageId(role, status),
        drawMarker(
          "shield",
          AGENT_STATUS_COLORS[status],
          AGENT_ROLE_GLYPHS[role],
          status === "responding" ? "#1b1f24" : "#ffffff",
        ),
        { pixelRatio: PIXEL_RATIO },
      );
    }
  }
}

const NARROW_MAP_WIDTH = 720;

export function cameraMotion(): { animate: boolean } {
  return { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches };
}

export type MapHandle = { map: MapLibreMap; online: boolean };

export function useMap(
  container: RefObject<HTMLDivElement | null>,
  options: { center: [number, number]; zoom: number; narrowBounds?: [LngLat, LngLat] },
): MapHandle | null {
  const [handle, setHandle] = useState<MapHandle | null>(null);
  const initial = useRef(options);

  useEffect(() => {
    let disposed = false;
    let instance: MapLibreMap | null = null;
    void loadStyle().then(({ style, online }) => {
      if (disposed || !container.current) {
        return;
      }
      const { center, zoom, narrowBounds } = initial.current;
      const fit = narrowBounds && container.current.clientWidth < NARROW_MAP_WIDTH;
      instance = new MapLibreMap({
        container: container.current,
        style,
        ...(fit ? { bounds: narrowBounds, fitBoundsOptions: { padding: 24 } } : { center, zoom }),
        minZoom: 10,
        maxZoom: 18,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
      const map = instance;
      map.on("load", () => {
        if (disposed) {
          return;
        }
        registerImages(map);
        setHandle({ map, online });
      });
    });
    return () => {
      disposed = true;
      instance?.remove();
      setHandle(null);
    };
  }, [container]);

  return handle;
}
