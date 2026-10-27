import { fold } from "../../shared/text.ts";
import { ListSearchBar } from "../components/ListSearchBar.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { EDIT_GLYPH, Glyph } from "../icons.tsx";
import { useMeta } from "../live.ts";
import { paginate } from "../pagination.ts";
import { Link } from "../router.tsx";
import { useListSearch } from "../useListSearch.ts";

export function AgenciesPage() {
  const meta = useMeta();
  const list = useListSearch("/agencies", "agencies");

  if (!meta) {
    return <LoadingNotice label="Carregando órgãos..." />;
  }

  const needle = fold(list.search);
  const rows = meta.agencies.filter((agency) => fold(agency.name).includes(needle));
  const page = paginate(rows, list.requestedPage, list.pageSize);

  return (
    <main className="page">
      <div className="page-head">
        <h1>Órgãos</h1>
        <Link href="/agencies/new" className="button button-primary">
          Cadastrar órgão
        </Link>
      </div>
      <div className="inventory-stack">
        <ListSearchBar
          id="agency-search"
          label="Buscar órgão"
          placeholder="Buscar nome"
          value={list.search}
          onChange={list.setSearch}
          shown={rows.length}
          total={meta.agencies.length}
          noun={["órgão", "órgãos"]}
        />
        <div className="table-wrap" data-sticky="page">
          <table>
            <caption className="visually-hidden">Lista de órgãos</caption>
            <thead>
              <tr>
                <th scope="col">Órgão</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="empty">
                    {meta.agencies.length === 0
                      ? "Nenhum órgão cadastrado ainda. Use Cadastrar órgão para começar."
                      : "Nenhum órgão corresponde à busca."}
                  </td>
                </tr>
              )}
              {page.items.map((agency) => (
                <tr key={agency.id}>
                  <td>
                    <Link href={`/agencies/${agency.id}`} className="row-button">
                      {agency.name}
                    </Link>
                  </td>
                  <td className="cell-actions">
                    <Link
                      href={`/agencies/${agency.id}`}
                      className="button button-ghost button-icon button-small"
                      aria-label={`Editar ${agency.name}`}
                      title="Editar"
                    >
                      <Glyph d={EDIT_GLYPH} size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          size={list.pageSize}
          label="órgãos"
          onChange={list.setPage}
          onSizeChange={list.setPageSize}
        />
      </div>
    </main>
  );
}
