let cityId: number | null = null;

export function currentCityId(): number | null {
  return cityId;
}

export function setCurrentCityId(id: number | null): void {
  cityId = id;
}

export function cityPath(path: string, id: number | null = cityId): string {
  return `/cities/${id ?? 0}${path}`;
}
