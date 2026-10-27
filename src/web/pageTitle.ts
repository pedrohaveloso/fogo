const TITLES: [RegExp, string][] = [
  [/^\/$/, "Central de operações"],
  [/^\/equipment$/, "Equipamentos"],
  [/^\/equipment\/new$/, "Cadastrar equipamento"],
  [/^\/equipment\/\d+$/, "Editar equipamento"],
  [/^\/agents$/, "Agentes"],
  [/^\/agents\/new$/, "Cadastrar agente"],
  [/^\/agents\/\d+$/, "Editar agente"],
  [/^\/management$/, "Gerenciamento"],
  [/^\/neighborhoods$/, "Bairros"],
  [/^\/predictions$/, "Cidade preditiva"],
  [/^\/agencies$/, "Órgãos"],
  [/^\/cities$/, "Cidades"],
  [/^\/cities\/new$/, "Cadastrar cidade"],
  [/^\/cities\/\d+$/, "Editar cidade"],
  [/^\/users$/, "Usuários"],
  [/^\/users\/new$/, "Cadastrar usuário"],
  [/^\/users\/\d+$/, "Editar usuário"],
  [/^\/account$/, "Minha senha"],
  [/^\/docs$/, "Documentações"],
];

export function pageTitle(pathname: string, cityName: string | null): string {
  const label = TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Página não encontrada";
  return cityName ? `${label}: FOGO ${cityName}` : `${label}: FOGO`;
}
