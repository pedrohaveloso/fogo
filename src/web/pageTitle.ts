const TITLES: [RegExp, string][] = [
  [/^\/$/, "Central de operações"],
  [/^\/equipamentos$/, "Equipamentos"],
  [/^\/equipamentos\/novo$/, "Cadastrar equipamento"],
  [/^\/equipamentos\/\d+$/, "Editar equipamento"],
  [/^\/agentes$/, "Agentes"],
  [/^\/agentes\/novo$/, "Cadastrar agente"],
  [/^\/agentes\/\d+$/, "Editar agente"],
  [/^\/bairros$/, "Bairros"],
  [/^\/previsoes$/, "Cidade preditiva"],
];

export function pageTitle(pathname: string): string {
  const label = TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Página não encontrada";
  return `${label}: F.O.G.O. Marília`;
}
