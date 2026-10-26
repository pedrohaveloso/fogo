import { LoadingNotice } from "../components/LoadingNotice.tsx";
import type { CitySummary } from "../../shared/types.ts";
import { EDIT_GLYPH, Glyph } from "../icons.tsx";
import { Link } from "../router.tsx";
import { useFetch } from "../useFetch.ts";

export function CitiesPage() {
  const cities = useFetch<CitySummary[]>("/cities");

  if (!cities.data) {
    return <LoadingNotice label="Carregando cidades..." onRetry={cities.reload} />;
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Cidades</h1>
        <Link href="/cities/new" className="button button-primary">
          Cadastrar cidade
        </Link>
      </div>
      <div className="table-wrap" data-sticky="page">
        <table>
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
            {cities.data.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Nenhuma cidade cadastrada ainda. Use Cadastrar cidade para começar.
                </td>
              </tr>
            )}
            {cities.data.map((city) => (
              <tr key={city.id}>
                <td>
                  <Link href={`/cities/${city.id}`} className="row-button">
                    {city.name}
                  </Link>
                  {city.simulated && <span className="plate">Simulação</span>}
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
    </main>
  );
}
