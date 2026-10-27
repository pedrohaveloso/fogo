import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Session, SessionUser } from "../shared/types.ts";
import { formatClock, formatTime } from "./format.ts";
import {
  AGENT_GLYPH,
  BrandMark,
  Glyph,
  MANAGE_GLYPH,
  MAP_GLYPH,
  TREND_GLYPH,
  TYPE_GLYPHS,
} from "./icons.tsx";
import { liveStatus, useLive } from "./live.ts";
import { AccountPage } from "./pages/AccountPage.tsx";
import { AgenciesPage } from "./pages/AgenciesPage.tsx";
import { AgencyFormPage } from "./pages/AgencyFormPage.tsx";
import { CitiesPage } from "./pages/CitiesPage.tsx";
import { DocsPage } from "./pages/DocsPage.tsx";
import { ManagementPage } from "./pages/ManagementPage.tsx";
import { CityFormPage } from "./pages/CityFormPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { UserFormPage } from "./pages/UserFormPage.tsx";
import { UsersPage } from "./pages/UsersPage.tsx";
import { chooseCity, loadSession, logout, useSession } from "./session.ts";
import { AgentFormPage } from "./pages/AgentFormPage.tsx";
import { AgentListPage } from "./pages/AgentListPage.tsx";
import { EquipmentFormPage } from "./pages/EquipmentFormPage.tsx";
import { EquipmentListPage } from "./pages/EquipmentListPage.tsx";
import { NeighborhoodsPage } from "./pages/NeighborhoodsPage.tsx";
import { OperationsPage } from "./pages/OperationsPage.tsx";
import { PredictionsPage } from "./pages/PredictionsPage.tsx";
import { pageTitle } from "./pageTitle.ts";
import { keptOperationsCity, OPERATIONS_PATH } from "./keptOperations.ts";
import { InlineLoading } from "./components/LoadingNotice.tsx";
import { Select } from "./components/Select.tsx";
import { Link, navigate, useLocation } from "./router.tsx";
import { showToast, Toast } from "./toast.tsx";
import { useNow } from "./useNow.ts";

const MANAGEMENT_PATHS = ["/management", "/neighborhoods", "/agencies", "/cities", "/users"];

const NAV = [
  {
    href: "/",
    label: "Central de operações",
    short: "Central",
    glyph: MAP_GLYPH,
    match: (path: string) => path === "/",
  },
  {
    href: "/equipment",
    label: "Equipamentos",
    short: "Equipamentos",
    glyph: TYPE_GLYPHS.camera,
    match: (path: string) => path.startsWith("/equipment"),
  },
  {
    href: "/agents",
    label: "Agentes",
    short: "Agentes",
    glyph: AGENT_GLYPH,
    match: (path: string) => path.startsWith("/agents"),
  },
  {
    href: "/predictions",
    label: "Cidade preditiva",
    short: "Preditiva",
    glyph: TREND_GLYPH,
    match: (path: string) => path.startsWith("/predictions"),
  },
  {
    href: "/management",
    label: "Gerenciamento",
    short: "Gerenciar",
    glyph: MANAGE_GLYPH,
    match: (path: string) => MANAGEMENT_PATHS.some((prefix) => path.startsWith(prefix)),
  },
];

function NotFound() {
  return (
    <main className="page not-found">
      <p className="plate" data-level="warning">
        Endereço não encontrado
      </p>
      <h1>Página não encontrada</h1>
      <p>Este endereço não existe no FOGO. Confira o link ou volte para a Central.</p>
      <Link href="/" className="button button-primary">
        Ir para a Central de operações
      </Link>
    </main>
  );
}

function NoCity({ user }: { user: SessionUser }) {
  return (
    <main className="page not-found">
      <h1>Nenhuma cidade para mostrar</h1>
      {user.role === "admin" ? (
        <>
          <p>Cadastre a primeira cidade para começar a montar zonas, bairros e o inventário.</p>
          <Link href="/cities/new" className="button button-primary">
            Cadastrar cidade
          </Link>
        </>
      ) : (
        <p>Seu usuário ainda não tem acesso a nenhuma cidade. Peça a um administrador.</p>
      )}
    </main>
  );
}

function adminRoute(pathname: string) {
  if (pathname === "/cities") {
    return <CitiesPage />;
  }
  if (pathname === "/cities/new") {
    return <CityFormPage id={null} />;
  }
  const city = /^\/cities\/(\d+)$/.exec(pathname);
  if (city) {
    return <CityFormPage id={Number(city[1])} />;
  }
  if (pathname === "/users") {
    return <UsersPage />;
  }
  if (pathname === "/users/new") {
    return <UserFormPage id={null} />;
  }
  const user = /^\/users\/(\d+)$/.exec(pathname);
  if (user) {
    return <UserFormPage id={Number(user[1])} />;
  }
  return null;
}

function cityRoute(pathname: string) {
  if (pathname === "/") {
    return <OperationsPage active />;
  }
  if (pathname === "/equipment") {
    return <EquipmentListPage />;
  }
  if (pathname === "/equipment/new") {
    return <EquipmentFormPage id={null} />;
  }
  const equipment = /^\/equipment\/(\d+)$/.exec(pathname);
  if (equipment) {
    return <EquipmentFormPage id={Number(equipment[1])} />;
  }
  if (pathname === "/agents") {
    return <AgentListPage />;
  }
  if (pathname === "/agents/new") {
    return <AgentFormPage id={null} />;
  }
  const agent = /^\/agents\/(\d+)$/.exec(pathname);
  if (agent) {
    return <AgentFormPage id={Number(agent[1])} />;
  }
  if (pathname === "/neighborhoods") {
    return <NeighborhoodsPage />;
  }
  if (pathname === "/predictions") {
    return <PredictionsPage />;
  }
  if (pathname === "/agencies") {
    return <AgenciesPage />;
  }
  if (pathname === "/agencies/new") {
    return <AgencyFormPage id={null} />;
  }
  const agency = /^\/agencies\/(\d+)$/.exec(pathname);
  if (agency) {
    return <AgencyFormPage id={Number(agency[1])} />;
  }
  return null;
}

function Route({ pathname, session }: { pathname: string; session: Session }) {
  const user = session.user!;
  if (pathname === "/account") {
    return <AccountPage />;
  }
  if (pathname === "/docs") {
    return <DocsPage />;
  }
  if (pathname === "/management") {
    return <ManagementPage />;
  }
  const admin = user.role === "admin" ? adminRoute(pathname) : null;
  if (admin) {
    return admin;
  }
  const scoped = cityRoute(pathname);
  if (scoped) {
    return session.cityId === null ? <NoCity user={user} /> : scoped;
  }
  return <NotFound />;
}

const ROUTE_FOCUS_DELAY_MS = 150;

function skipToContent(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const main = document.querySelector<HTMLElement>("main:not([hidden])");
  main?.setAttribute("tabindex", "-1");
  main?.focus();
}

function LiveStatus() {
  const live = useLive();
  const now = useNow(1000);
  const status = liveStatus(live, now);
  return (
    <span
      className="live-dot"
      data-stale={status.stale}
      role="status"
      title={
        live.receivedAt === 0
          ? undefined
          : `Última atualização às ${formatClock(new Date(live.receivedAt).toISOString())}`
      }
    >
      {status.text}
    </span>
  );
}

async function changeCity(id: number): Promise<void> {
  try {
    await chooseCity(id);
  } catch {
    showToast("Não foi possível trocar de cidade. Tente de novo.");
  }
}

async function exit(): Promise<void> {
  await logout();
  navigate("/");
}

function CitySwitcher({ session }: { session: Session }) {
  if (session.cities.length < 2) {
    return null;
  }
  return (
    <div className="city-switcher">
      <label htmlFor="city-switcher" className="visually-hidden">
        Cidade
      </label>
      <Select
        id="city-switcher"
        size="sm"
        value={session.cityId === null ? "" : String(session.cityId)}
        options={session.cities.map((city) => ({
          value: String(city.id),
          label: `${city.name}, ${city.uf}`,
        }))}
        onChange={(value) => void changeCity(Number(value))}
      />
    </div>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute("open");
  return (
    <details ref={ref} className="user-menu">
      <summary aria-label={`Menu de ${user.name}`}>
        <Glyph d={AGENT_GLYPH} size={20} />
      </summary>
      <div className="user-menu-body">
        <p className="user-menu-who">
          <strong>{user.name}</strong>
          <span>{user.role === "admin" ? "Administrador" : "Usuário"}</span>
        </p>
        <nav aria-label="Conta">
          <Link href="/docs" onClick={close}>
            Documentações
          </Link>
          <Link href="/account" onClick={close}>
            Minha senha
          </Link>
        </nav>
        <button type="button" className="button button-small" onClick={() => void exit()}>
          Sair
        </button>
      </div>
    </details>
  );
}

function Shell({ session, user }: { session: Session; user: SessionUser }) {
  const { pathname } = useLocation();
  const now = useNow(15_000);
  const city = session.cities.find((item) => item.id === session.cityId) ?? null;
  const cityName = city?.name ?? null;
  const firstRoute = useRef(true);
  const onOperations = pathname === OPERATIONS_PATH;
  const [keptOperations, setKeptOperations] = useState(() =>
    keptOperationsCity(null, pathname, session.cityId),
  );
  const nextKeptOperations = keptOperationsCity(keptOperations, pathname, session.cityId);
  if (nextKeptOperations !== keptOperations) {
    setKeptOperations(nextKeptOperations);
  }

  useEffect(() => {
    document.title = pageTitle(pathname, cityName);
    window.scrollTo(0, 0);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const main = document.querySelector<HTMLElement>("main:not([hidden])");
      main?.setAttribute("tabindex", "-1");
      main?.focus({ preventScroll: true });
    }, ROUTE_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname, cityName]);

  return (
    <div className="app">
      <a href="#content" className="skip-link" onClick={skipToContent}>
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="FOGO, página inicial">
          <BrandMark />
          <span className="brand-name" aria-hidden="true">
            FOGO
          </span>
        </Link>
        <nav className="nav" aria-label="Principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.match(pathname) ? "page" : undefined}
            >
              <span className="nav-icon">
                <Glyph d={item.glyph} size={20} />
              </span>
              <span className="nav-full">{item.label}</span>
              <span className="nav-short">{item.short}</span>
            </Link>
          ))}
        </nav>
        <div className="topbar-status">
          {city?.simulated && session.mode === "simulation" && (
            <span
              className="plate"
              title="Os dados são gerados pelo simulador. Ocorrências e falhas acontecem mais rápido que na vida real."
            >
              Simulação
            </span>
          )}
          {session.cityId !== null && <LiveStatus />}
          <time className="clock" dateTime={new Date(now).toISOString()}>
            {formatTime(new Date(now).toISOString())}
          </time>
          <CitySwitcher session={session} />
          <UserMenu user={user} />
        </div>
      </header>
      {nextKeptOperations !== null && (
        <OperationsPage key={`operations-${nextKeptOperations}`} active={onOperations} />
      )}
      {!(nextKeptOperations !== null && onOperations) && (
        <Route key={session.cityId ?? "none"} pathname={pathname} session={session} />
      )}
      <Toast />
    </div>
  );
}

export function App() {
  const { session, error } = useSession();

  useEffect(() => {
    void loadSession();
  }, []);

  if (!session) {
    return (
      <main className="page">
        {error ? (
          <div className="loading-notice" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="button button-small"
              onClick={() => void loadSession()}
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <InlineLoading label="Carregando..." onRetry={() => void loadSession()} />
        )}
      </main>
    );
  }
  if (!session.user) {
    return <LoginPage />;
  }
  return <Shell session={session} user={session.user} />;
}
