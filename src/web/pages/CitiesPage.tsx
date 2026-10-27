import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { fold } from "../../shared/text.ts";
import type { CitySummary } from "../../shared/types.ts";
import { ListSearchBar } from "../components/ListSearchBar.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { EDIT_GLYPH, Glyph } from "../icons.tsx";
import { paginate } from "../pagination.ts";
import { Link } from "../router.tsx";
import { useFetch } from "../useFetch.ts";
import { useListSearch } from "../useListSearch.ts";

function matches(city: CitySummary, needle: string): boolean {
  return fold(`${city.name} ${city.uf} ${city.ibgeCode}`).includes(needle);
}

export function CitiesPage() {
  const cities = useFetch<CitySummary[]>("/cities");
  const list = useListSearch("/cities", "cities");

  if (!cities.data) {
    return <LoadingNotice label="Carregando cidades..." onRetry={cities.reload} />;
  }

  const needle = fold(list.search);
  const rows = cities.data.filter((city) => matches(city, needle));
  const page = paginate(rows, list.requestedPage, list.pageSize);

  return (
    <main className="page">
      <Breadcrumb items={[{ label: "Gerenciamento", href: "/management" }]} />
      <div className="page-head">
        <h1>Cidades</h1>
        <Link href="/cities/new" className="button button-primary">
          Cadastrar cidade
        </Link>
      </div>
      <div className="inventory-stack">
        <ListSearchBar
          id="city-search"
          label="Buscar cidade"
          placeholder="Buscar nome, UF ou código IBGE"
          value={list.search}
          onChange={list.setSearch}
          shown={rows.length}
          total={cities.data.length}
          noun={["cidade", "cidades"]}
        />
        <div className="table-wrap" data-sticky="page">
          <table>
            <caption className="visually-hidden">Lista de cidades</caption>
            <thead>
              <tr>
                <th scope="col">Cidade</th>
                <th scope="col">UF</th>
                <th scope="col">Código IBGE</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    {cities.data.length === 0
                      ? "Nenhuma cidade cadastrada ainda. Use Cadastrar cidade para começar."
                      : "Nenhuma cidade corresponde à busca."}
                  </td>
                </tr>
              )}
              {page.items.map((city) => (
                <tr key={city.id}>
                  <td>
                    <span className="cell-title">
                      <Link href={`/cities/${city.id}`} className="row-button">
                        {city.name}
                      </Link>
                      {city.simulated && <span className="plate">Simulação</span>}
                    </span>
                  </td>
                  <td>{city.uf}</td>
                  <td>{city.ibgeCode}</td>
                  <td className="cell-actions">
                    <Link
                      href={`/cities/${city.id}`}
                      className="button button-ghost button-icon button-small"
                      aria-label={`Editar ${city.name}`}
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
          label="cidades"
          onChange={list.setPage}
          onSizeChange={list.setPageSize}
        />
      </div>
    </main>
  );
}
