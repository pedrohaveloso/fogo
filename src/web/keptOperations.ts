export const OPERATIONS_PATH = "/";

export function keptOperationsCity(
  kept: number | null,
  pathname: string,
  cityId: number | null,
): number | null {
  if (cityId === null) {
    return null;
  }
  if (pathname === OPERATIONS_PATH) {
    return cityId;
  }
  return kept === cityId ? kept : null;
}
