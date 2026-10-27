import type { ReactNode } from "react";
import { plural } from "../../shared/text.ts";
import type { User } from "../../shared/types.ts";
import { formatInteger } from "../format.ts";
import { AGENCY_GLYPH, AGENT_GLYPH, AREA_GLYPH, Glyph, MAP_GLYPH } from "../icons.tsx";
import { useMeta } from "../live.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.ts";
import { useFetch } from "../useFetch.ts";

function Entry({
  href,
  glyph,
  title,
  count,
}: {
  href: string;
  glyph: string;
  title: string;
  count: ReactNode;
}) {
  return (
    <Link href={href} className="manage-card panel">
      <Glyph d={glyph} size={24} />
      <span className="manage-card-text">
        <strong>{title}</strong>
        <small>{count}</small>
      </span>
    </Link>
  );
}

function counted(total: number, singular: string, pluralForm: string): string {
  return `${formatInteger(total)} ${plural(total, singular, pluralForm)}`;
}

export function ManagementPage() {
  const { session } = useSession();
  const meta = useMeta();
  const admin = session?.user?.role === "admin";
  const users = useFetch<User[]>(admin ? "/users" : null);
  const hasCity = session?.cityId !== null;

  return (
    <main className="page">
      <div className="page-head">
        <h1>Gerenciamento</h1>
      </div>
      <div className="manage-grid">
        {hasCity && (
          <Entry
            href="/neighborhoods"
            glyph={AREA_GLYPH}
            title="Bairros"
            count={
              meta
                ? `${counted(meta.neighborhoods.length, "bairro", "bairros")} em ${counted(meta.regions.length, "zona", "zonas")}`
                : ""
            }
          />
        )}
        {hasCity && (
          <Entry
            href="/agencies"
            glyph={AGENCY_GLYPH}
            title="Órgãos"
            count={meta ? counted(meta.agencies.length, "órgão", "órgãos") : ""}
          />
        )}
        {admin && (
          <Entry
            href="/cities"
            glyph={MAP_GLYPH}
            title="Cidades"
            count={counted(session?.cities.length ?? 0, "cidade", "cidades")}
          />
        )}
        {admin && (
          <Entry
            href="/users"
            glyph={AGENT_GLYPH}
            title="Usuários"
            count={users.data ? counted(users.data.length, "usuário", "usuários") : ""}
          />
        )}
      </div>
    </main>
  );
}
