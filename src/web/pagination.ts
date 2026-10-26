export const PAGE_SIZE = 50;

export type PageSize = number | "all";

const PAGE_PARAM = "page";

export type Page<T> = {
  items: T[];
  page: number;
  pageCount: number;
  first: number;
  last: number;
  total: number;
};

export function pageFromQuery(params: URLSearchParams): number {
  const value = Number(params.get(PAGE_PARAM));
  return Number.isInteger(value) && value > 1 ? value : 1;
}

export function withPage(query: string, page: number): string {
  const params = new URLSearchParams(query);
  if (page > 1) {
    params.set(PAGE_PARAM, String(page));
  } else {
    params.delete(PAGE_PARAM);
  }
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export function paginate<T>(rows: readonly T[], requested: number, size = PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * size;
  const items = rows.slice(start, start + size);
  return {
    items,
    page,
    pageCount,
    first: items.length === 0 ? 0 : start + 1,
    last: start + items.length,
    total: rows.length,
  };
}

export function pageOfIndex(index: number, size = PAGE_SIZE): number {
  return Math.floor(index / size) + 1;
}
