import { isSimplePolygon, type LngLat } from "../shared/geo.ts";
import type { NeighborhoodShape } from "../shared/types.ts";

export const MIN_SHAPE_POINTS = 3;

export function moveVertex(polygon: readonly LngLat[], index: number, point: LngLat): LngLat[] {
  return polygon.map((vertex, current) => (current === index ? point : vertex));
}

export function insertVertex(polygon: readonly LngLat[], edge: number, point: LngLat): LngLat[] {
  return [...polygon.slice(0, edge + 1), point, ...polygon.slice(edge + 1)];
}

export function removeVertex(polygon: readonly LngLat[], index: number): LngLat[] {
  if (polygon.length <= MIN_SHAPE_POINTS) {
    return [...polygon];
  }
  return polygon.filter((_, current) => current !== index);
}

export function midpoints(polygon: readonly LngLat[]): LngLat[] {
  if (polygon.length < 2) {
    return [];
  }
  return polygon.map((vertex, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return [(vertex[0] + next[0]) / 2, (vertex[1] + next[1]) / 2];
  });
}

export function shapeProblem(polygon: readonly LngLat[]): string | null {
  if (polygon.length < MIN_SHAPE_POINTS) {
    return `Marque ao menos ${MIN_SHAPE_POINTS} pontos para fechar o bairro.`;
  }
  return isSimplePolygon(polygon) ? null : "As linhas do bairro estão se cruzando.";
}

export function sameShape(a: readonly LngLat[], b: readonly LngLat[]): boolean {
  return (
    a.length === b.length &&
    a.every((point, index) => point[0] === b[index]![0] && point[1] === b[index]![1])
  );
}

export function mergeShapes(
  base: readonly NeighborhoodShape[],
  changes: ReadonlyMap<string, NeighborhoodShape | null>,
): NeighborhoodShape[] {
  const known = new Set(base.map((item) => item.id));
  const added = [...changes.values()].filter((item) => item !== null && !known.has(item.id));
  return [
    ...base.map((item) => (changes.has(item.id) ? (changes.get(item.id) ?? null) : item)),
    ...added,
  ].filter((item): item is NeighborhoodShape => item !== null);
}
