const TITLES: [RegExp, string][] = [
  [/^\/$/, "Central de operações"],
  [/^\/equipment$/, "Equipamentos"],
  [/^\/equipment\/new$/, "Cadastrar equipamento"],
  [/^\/equipment\/\d+$/, "Editar equipamento"],
  [/^\/agents$/, "Agentes"],
  [/^\/agents\/new$/, "Cadastrar agente"],
  [/^\/agents\/\d+$/, "Editar agente"],
  [/^\/neighborhoods$/, "Bairros"],
  [/^\/predictions$/, "Cidade preditiva"],
];

export function pageTitle(pathname: string): string {
  const label = TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Página não encontrada";
  return `${label}: FOGO Marília`;
}
