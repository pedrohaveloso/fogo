import { useId } from "react";
import { formatInteger } from "../format.ts";
import { PAGE_SIZES, parsePageSize, type Page, type PageSize } from "../pagination.ts";

export function Pagination({
  page,
  size,
  label,
  onChange,
  onSizeChange,
}: {
  page: Page<unknown>;
  size: PageSize;
  label: string;
  onChange: (page: number) => void;
  onSizeChange: (size: PageSize) => void;
}) {
  const id = useId();
  if (page.total <= PAGE_SIZES[0]) {
    return null;
  }
  return (
    <nav className="pagination" aria-label={`Páginas de ${label}`}>
      <span className="pagination-range">
        <label htmlFor={`${id}-size`}>Mostrar</label>
        <select
          id={`${id}-size`}
          className="input input-small"
          value={String(size)}
          onChange={(event) => onSizeChange(parsePageSize(event.target.value))}
        >
          {PAGE_SIZES.map((option) => (
            <option key={option} value={option}>
              {option} por página
            </option>
          ))}
          <option value="all">Todos</option>
        </select>
        <span>
          {formatInteger(page.first)} a {formatInteger(page.last)} de {formatInteger(page.total)}
        </span>
      </span>
      {page.pageCount > 1 && (
        <>
          <button
            type="button"
            className="button button-small"
            disabled={page.page === 1}
            onClick={() => onChange(page.page - 1)}
          >
            Anterior
          </button>
          <span className="pagination-current">
            <label htmlFor={`${id}-page`}>Página</label>
            <select
              id={`${id}-page`}
              className="input input-small"
              value={page.page}
              onChange={(event) => onChange(Number(event.target.value))}
            >
              {Array.from({ length: page.pageCount }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
            de {page.pageCount}
          </span>
          <button
            type="button"
            className="button button-small"
            disabled={page.page === page.pageCount}
            onClick={() => onChange(page.page + 1)}
          >
            Próxima
          </button>
        </>
      )}
    </nav>
  );
}
