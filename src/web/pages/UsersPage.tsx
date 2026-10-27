import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { fold } from "../../shared/text.ts";
import type { User } from "../../shared/types.ts";
import { ListSearchBar } from "../components/ListSearchBar.tsx";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { Pagination } from "../components/Pagination.tsx";
import { formatDate } from "../format.ts";
import { EDIT_GLYPH, Glyph } from "../icons.tsx";
import { paginate } from "../pagination.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.ts";
import { useFetch } from "../useFetch.ts";
import { useListSearch } from "../useListSearch.ts";

export function UsersPage() {
  const users = useFetch<User[]>("/users");
  const list = useListSearch("/users", "users");
  const cities = useSession().session?.cities ?? [];
  const cityNames = new Map(cities.map((city) => [city.id, `${city.name}/${city.uf}`]));

  if (!users.data) {
    return <LoadingNotice label="Carregando usuários..." onRetry={users.reload} />;
  }

  const needle = fold(list.search);
  const rows = users.data.filter((user) => fold(`${user.name} ${user.username}`).includes(needle));
  const page = paginate(rows, list.requestedPage, list.pageSize);

  return (
    <main className="page">
      <Breadcrumb items={[{ label: "Gerenciamento", href: "/management" }]} />
      <div className="page-head">
        <h1>Usuários</h1>
        <Link href="/users/new" className="button button-primary">
          Cadastrar usuário
        </Link>
      </div>
      <div className="inventory-stack">
        <ListSearchBar
          id="user-search"
          label="Buscar usuário"
          placeholder="Buscar nome ou usuário"
          value={list.search}
          onChange={list.setSearch}
          shown={rows.length}
          total={users.data.length}
          noun={["usuário", "usuários"]}
        />
        <div className="table-wrap" data-sticky="page">
          <table>
            <caption className="visually-hidden">Lista de usuários</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Perfil</th>
                <th scope="col">Cidades</th>
                <th scope="col">Desde</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    Nenhum usuário corresponde à busca.
                  </td>
                </tr>
              )}
              {page.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/users/${user.id}`} className="row-button">
                      {user.name}
                    </Link>
                    <span className="cell-sub">{user.username}</span>
                  </td>
                  <td>{user.role === "admin" ? "Administrador" : "Usuário"}</td>
                  <td>
                    {user.role === "admin"
                      ? "Todas"
                      : user.cityIds.map((id) => cityNames.get(id)).join(", ") || "Nenhuma"}
                  </td>
                  <td>{formatDate(user.createdAt.slice(0, 10))}</td>
                  <td className="cell-actions">
                    <Link
                      href={`/users/${user.id}`}
                      className="button button-ghost button-icon button-small"
                      aria-label={`Editar ${user.name}`}
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
          label="usuários"
          onChange={list.setPage}
          onSizeChange={list.setPageSize}
        />
      </div>
    </main>
  );
}
