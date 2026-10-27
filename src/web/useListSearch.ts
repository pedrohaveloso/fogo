import { searchQuery } from "./listQuery.ts";
import { pageFromQuery, withPage, type PageSize } from "./pagination.ts";
import { navigate, useLocation } from "./router.tsx";
import { usePageSize } from "./usePageSize.ts";

export function useListSearch(path: string, list: string) {
  const { params } = useLocation();
  const search = params.get("search") ?? "";
  const [pageSize, storePageSize] = usePageSize(list);
  const go = (nextSearch: string, page = 1) =>
    navigate(`${path}${withPage(searchQuery(nextSearch), page)}`, { replace: true });
  return {
    search,
    requestedPage: pageFromQuery(params),
    pageSize,
    setSearch: (value: string) => go(value),
    setPage: (page: number) => go(search, page),
    setPageSize: (size: PageSize) => {
      storePageSize(size);
      go(search);
    },
  };
}
