import type { User } from "../../shared/types.ts";
import { LoadingNotice } from "../components/LoadingNotice.tsx";
import { formatDate } from "../format.ts";
import { EDIT_GLYPH, Glyph } from "../icons.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.ts";
import { useFetch } from "../useFetch.ts";

export function UsersPage() {
  const users = useFetch<User[]>("/users");
  const cities = useSession().session?.cities ?? [];
  const cityNames = new Map(cities.map((city) => [city.id, `${city.name}/${city.uf}`]));

  if (!users.data) {
    return <LoadingNotice label="Carregando usuários..." onRetry={users.reload} />;
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Usuários</h1>
        <Link href="/users/new" className="button button-primary">
          Cadastrar usuário
        </Link>
      </div>
      <div className="table-wrap" data-sticky="page">
        <table>
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
            {users.data.map((user) => (
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
    </main>
  );
}
