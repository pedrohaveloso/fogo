import { formatInteger } from "../format.ts";
import type { Page } from "../pagination.ts";

export function Pagination({
  page,
  label,
  onChange,
}: {
  page: Page<unknown>;
  label: string;
  onChange: (page: number) => void;
}) {
  if (page.pageCount <= 1) {
    return null;
  }
  return (
    <nav className="pagination" aria-label={`Páginas de ${label}`}>
      <span className="pagination-range">
        {formatInteger(page.first)} a {formatInteger(page.last)} de {formatInteger(page.total)}
      </span>
      <button
        type="button"
        className="button button-small"
        disabled={page.page === 1}
        onClick={() => onChange(page.page - 1)}
      >
        Anterior
      </button>
      <span className="pagination-current" aria-current="page">
        Página {page.page} de {page.pageCount}
      </span>
      <button
        type="button"
        className="button button-small"
        disabled={page.page === page.pageCount}
        onClick={() => onChange(page.page + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
