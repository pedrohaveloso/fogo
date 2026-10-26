export const PAGE_SIZE = 50;
export const PAGE_SIZES = [10, 25, 50, 100] as const;

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

export function parsePageSize(raw: string | null): PageSize {
  if (raw === "all") {
    return "all";
  }
  const value = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(value) ? value : PAGE_SIZE;
}

function rowsPerPage(rows: number, size: PageSize): number {
  return size === "all" ? Math.max(1, rows) : size;
}

export function paginate<T>(
  rows: readonly T[],
  requested: number,
  size: PageSize = PAGE_SIZE,
): Page<T> {
  const perPage = rowsPerPage(rows.length, size);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * perPage;
  const items = rows.slice(start, start + perPage);
  return {
    items,
    page,
    pageCount,
    first: items.length === 0 ? 0 : start + 1,
    last: start + items.length,
    total: rows.length,
  };
}

export function pageOfIndex(index: number, size: PageSize = PAGE_SIZE): number {
  return size === "all" ? 1 : Math.floor(index / size) + 1;
}
