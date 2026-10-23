const STORAGE_KEY = "fogo:equipment-views";
export const MAX_VIEWS = 12;
export const MAX_NAME_LENGTH = 40;

export type SavedView = { name: string; query: string };

function isView(value: unknown): value is SavedView {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "query" in value &&
    typeof value.query === "string"
  );
}

export function parseViews(raw: string | null): SavedView[] {
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isView).slice(0, MAX_VIEWS) : [];
  } catch {
    return [];
  }
}

export function addView(views: SavedView[], name: string, query: string): SavedView[] | null {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed === "") {
    return null;
  }
  const others = views.filter((view) => view.name.toLowerCase() !== trimmed.toLowerCase());
  if (others.length >= MAX_VIEWS) {
    return null;
  }
  return [...others, { name: trimmed, query }];
}

export function removeView(views: SavedView[], name: string): SavedView[] {
  return views.filter((view) => view.name !== name);
}

export function loadViews(): SavedView[] {
  try {
    return parseViews(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function storeViews(views: SavedView[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    return;
  }
}
