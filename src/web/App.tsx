import { useEffect, useRef, type MouseEvent } from "react";
import { formatClock, formatTime } from "./format.ts";
import {
  AGENT_GLYPH,
  AREA_GLYPH,
  BrandMark,
  Glyph,
  MAP_GLYPH,
  TREND_GLYPH,
  TYPE_GLYPHS,
} from "./icons.tsx";
import { liveStatus, useLive } from "./live.ts";
import { AgentFormPage } from "./pages/AgentFormPage.tsx";
import { AgentListPage } from "./pages/AgentListPage.tsx";
import { EquipmentFormPage } from "./pages/EquipmentFormPage.tsx";
import { EquipmentListPage } from "./pages/EquipmentListPage.tsx";
import { NeighborhoodsPage } from "./pages/NeighborhoodsPage.tsx";
import { OperationsPage } from "./pages/OperationsPage.tsx";
import { PredictionsPage } from "./pages/PredictionsPage.tsx";
import { pageTitle } from "./pageTitle.ts";
import { Link, useLocation } from "./router.tsx";
import { Toast } from "./toast.tsx";
import { useNow } from "./useNow.ts";

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
    href: "/neighborhoods",
    label: "Bairros",
    short: "Bairros",
    glyph: AREA_GLYPH,
    match: (path: string) => path.startsWith("/neighborhoods"),
  },
  {
    href: "/predictions",
    label: "Cidade preditiva",
    short: "Preditiva",
    glyph: TREND_GLYPH,
    match: (path: string) => path.startsWith("/predictions"),
  },
];

function Route({ pathname }: { pathname: string }) {
  if (pathname === "/") {
    return <OperationsPage />;
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

const ROUTE_FOCUS_DELAY_MS = 150;

function skipToContent(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const main = document.querySelector("main");
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

export function App() {
  const { pathname } = useLocation();
  const now = useNow(15_000);

  const firstRoute = useRef(true);

  useEffect(() => {
    document.title = pageTitle(pathname);
    window.scrollTo(0, 0);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const main = document.querySelector("main");
      main?.setAttribute("tabindex", "-1");
      main?.focus({ preventScroll: true });
    }, ROUTE_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="app">
      <a href="#content" className="skip-link" onClick={skipToContent}>
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="FOGO Marília, página inicial">
          <BrandMark />
          <span className="brand-text" aria-hidden="true">
            <span className="brand-name">FOGO</span>
            <span className="brand-city">Marília, SP</span>
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
          <LiveStatus />
          <time className="clock" dateTime={new Date(now).toISOString()}>
            {formatTime(new Date(now).toISOString())}
          </time>
        </div>
      </header>
      <Route pathname={pathname} />
      <Toast />
    </div>
  );
}
