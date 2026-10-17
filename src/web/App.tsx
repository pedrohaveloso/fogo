import { useEffect } from "react";
import { formatTime } from "./format.ts";
import { useLive } from "./live.ts";
import { AgentFormPage } from "./pages/AgentFormPage.tsx";
import { AgentListPage } from "./pages/AgentListPage.tsx";
import { EquipmentFormPage } from "./pages/EquipmentFormPage.tsx";
import { EquipmentListPage } from "./pages/EquipmentListPage.tsx";
import { OperationsPage } from "./pages/OperationsPage.tsx";
import { PredictionsPage } from "./pages/PredictionsPage.tsx";
import { Link, useLocation } from "./router.tsx";
import { Toast } from "./toast.tsx";
import { useNow } from "./useNow.ts";

const NAV = [
  { href: "/", label: "Central de operações", match: (path: string) => path === "/" },
  {
    href: "/equipamentos",
    label: "Equipamentos",
    match: (path: string) => path.startsWith("/equipamentos"),
  },
  { href: "/agentes", label: "Agentes", match: (path: string) => path.startsWith("/agentes") },
  {
    href: "/previsoes",
    label: "Cidade preditiva",
    match: (path: string) => path.startsWith("/previsoes"),
  },
];

function Route({ pathname }: { pathname: string }) {
  if (pathname === "/") {
    return <OperationsPage />;
  }
  if (pathname === "/equipamentos") {
    return <EquipmentListPage />;
  }
  if (pathname === "/equipamentos/novo") {
    return <EquipmentFormPage id={null} />;
  }
  const equipment = /^\/equipamentos\/(\d+)$/.exec(pathname);
  if (equipment) {
    return <EquipmentFormPage id={Number(equipment[1])} />;
  }
  if (pathname === "/agentes") {
    return <AgentListPage />;
  }
  if (pathname === "/agentes/novo") {
    return <AgentFormPage id={null} />;
  }
  const agent = /^\/agentes\/(\d+)$/.exec(pathname);
  if (agent) {
    return <AgentFormPage id={Number(agent[1])} />;
  }
  if (pathname === "/previsoes") {
    return <PredictionsPage />;
  }
  return (
    <main className="page">
      <h1>Página não encontrada</h1>
      <p>
        O endereço não existe. <Link href="/">Voltar para a central de operações</Link>
      </p>
    </main>
  );
}

export function App() {
  const { pathname } = useLocation();
  const live = useLive();
  const now = useNow(15_000);

  useEffect(() => {
    const current = NAV.find((item) => item.match(pathname));
    document.title = current ? `${current.label}: F.O.G.O. Marília` : "F.O.G.O. Marília";
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="F.O.G.O., página inicial">
          <span className="brand-sign" aria-hidden="true">
            <span>F</span>
          </span>
          <span className="brand-name">F.O.G.O.</span>
          <span className="brand-city">Marília, SP</span>
        </Link>
        <nav className="nav" aria-label="Principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.match(pathname) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-status">
          <span className="live-dot" data-on={live.connected} role="status">
            {live.connected ? "Ao vivo" : "Reconectando"}
          </span>
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
