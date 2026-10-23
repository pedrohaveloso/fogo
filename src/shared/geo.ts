export type LngLat = [number, number];

const EARTH_RADIUS_KM = 6371;

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function cross(origin: LngLat, a: LngLat, b: LngLat): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

export function convexHull(points: LngLat[]): LngLat[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) {
    return sorted;
  }
  const lower: LngLat[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: LngLat[] = [];
  for (const point of sorted.toReversed()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function centroid(points: LngLat[]): LngLat {
  const lng = points.reduce((sum, [value]) => sum + value, 0) / points.length;
  const lat = points.reduce((sum, [, value]) => sum + value, 0) / points.length;
  return [lng, lat];
}

export function scalePolygon(polygon: LngLat[], factor: number): LngLat[] {
  if (polygon.length === 0) {
    return polygon;
  }
  const [cx, cy] = centroid(polygon);
  return polygon.map(([lng, lat]) => [cx + (lng - cx) * factor, cy + (lat - cy) * factor]);
}

export function pointInPolygon([lng, lat]: LngLat, polygon: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function moveTowards(from: LngLat, to: LngLat, stepKm: number): LngLat {
  const total = distanceKm(from, to);
  if (total <= stepKm || total === 0) {
    return to;
  }
  const ratio = stepKm / total;
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
}

export function roundPolygon(polygon: LngLat[]): LngLat[] {
  return polygon.map(([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))]);
}

export function containingArea<T extends { lat: number; lng: number; polygon: LngLat[] }>(
  areas: readonly T[],
  point: LngLat,
): T | null {
  return areas.find((item) => pointInPolygon(point, item.polygon)) ?? null;
}

export function closestArea<T extends { lat: number; lng: number; polygon: LngLat[] }>(
  areas: readonly T[],
  point: LngLat,
): T {
  const containing = containingArea(areas, point);
  if (containing) {
    return containing;
  }
  let best = areas[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const area of areas) {
    const distance = distanceKm(point, [area.lng, area.lat]);
    if (distance < bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}
