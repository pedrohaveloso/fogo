# Entrega do F.O.G.O.: configuração para IA e documentação

Pesquisa feita em 22/10/2026. Nenhum arquivo do projeto além deste foi alterado.

## Resumo

O código está em bom estado para entrega: 18 commits convencionais em inglês, nenhum comentário em `src/` e `scripts/`, CI com ações fixadas por hash, Docker com `compose.yaml` e README completo no conteúdo. Faltam as peças que um avaliador procura antes de ler o código: LICENSE, capturas de tela, visão de arquitetura com diagrama, registro de decisões, crédito de dados em arquivo próprio e a configuração de IA do repositório (CLAUDE.md e `.claude/`).

Não encontrei o regulamento nem os critérios de avaliação da Etapa Bônus. O site oficial (appcoderchallenge.dsin.com.br) respondeu 403 e a busca só devolveu repositórios de outros participantes. O único indício indireto é um README de participante que diz ter declarado o uso de Claude "conforme pede o regulamento", ou seja, o regulamento provavelmente exige declarar uso de IA. O F.O.G.O. já tem essa seção. Recomendo que o dono do projeto confira o enunciado original e acrescente à seção de gaps qualquer item que eu não pude ver.

Prioridade sugerida: LICENSE e crédito de dados, CLAUDE.md curto, capturas de tela e um GIF no README, `docs/arquitetura.md` com Mermaid, três ou quatro ADRs, `.claude/settings.json` com permissões e um hook de verificação.

## Configuração para IA

### O que a documentação oficial recomenda

- CLAUDE.md é contexto, não regra imposta. Para algo que precisa acontecer sempre, a documentação manda usar hook ("Unlike CLAUDE.md instructions which are advisory, hooks are deterministic"). Para bloquear ações, `permissions.deny` ou um hook PreToolUse.
- Tamanho: menos de 200 linhas por arquivo. Arquivos longos gastam contexto e reduzem a aderência. Imports com `@arquivo` organizam, mas não reduzem o custo, porque também carregam na partida.
- Teste de cada linha: "removê-la faria Claude errar?" Se não, corte. Incluir: comandos que Claude não adivinha, regras de estilo que fogem do padrão, como testar, convenção de branch e commit, decisões de arquitetura próprias, manhas do ambiente. Excluir: o que se descobre lendo o código, convenções padrão da linguagem, descrição arquivo por arquivo, documentação de API longa, informação que muda sempre.
- Regras por caminho em `.claude/rules/*.md` com `paths:` no frontmatter só entram no contexto quando Claude abre arquivos que casam. Tarefas e conhecimento que só servem às vezes vão para skills, que carregam sob demanda.
- Skills ficam em `.claude/skills/<nome>/SKILL.md`; use `disable-model-invocation: true` em fluxos com efeito colateral. Subagentes ficam em `.claude/agents/*.md` com `tools` restritas. A documentação recomenda um revisor em contexto novo antes de dar uma tarefa por concluída.
- `.claude/settings.json` é versionado (permissões, hooks, plugins). `.claude/settings.local.json` é pessoal e fica fora do git. Regras `allow` do arquivo versionado só valem depois que cada pessoa confia na pasta; `deny` e `ask` valem na hora.
- AGENTS.md: Claude Code lê AGENTS.md só quando não existe nenhum CLAUDE.md no diretório ou acima. Para servir outras ferramentas, a forma documentada é um CLAUDE.md que importa o AGENTS.md com `@AGENTS.md`. O formato AGENTS.md (agents.md) é Markdown livre, "um README para agentes", sem campos obrigatórios.
- `/init` gera um ponto de partida; `/doctor prompt-audit` aponta instruções desatualizadas ou que contradizem umas às outras.
- Para o que não é fixo (comandos de slash), hoje skills substituem `.claude/commands`; arquivos antigos em `commands/` continuam funcionando, mas não vale criar novos.

Sobre repositórios de referência: não consegui abrir CLAUDE.md reais de projetos conhecidos (o do repositório do Hono não existe e o do `anthropics/claude-code` é só um aviso de segurança de CI com cerca de 450 palavras). Os padrões abaixo vêm de guias de terceiros, então tratam-se de convenção de comunidade, não de fonte oficial: visão do projeto em uma ou duas linhas, comandos, mapa curto de diretórios, convenções que fogem do padrão e armadilhas; raiz abaixo de 100 linhas, com o resto em skills e `docs/`.

### Proposta para este repositório

A configuração pessoal em `~/.claude` já impõe boa parte das regras gerais (Português, Exa, ferramentas, commits). O CLAUDE.md do projeto deve conter só o que é do F.O.G.O. e do dono, e evitar repetir o global. Como o projeto é pessoal e usa só Claude Code, recomendo apenas o `CLAUDE.md` e pular o AGENTS.md. Se um dia outra ferramenta precisar ler o repositório, o caminho documentado é um `CLAUDE.md` que importa o `AGENTS.md` com `@AGENTS.md`.

Esboço de `CLAUDE.md`, cerca de 60 linhas:

```
# F.O.G.O.

Sistema de inventário, central de operações e previsão para a prefeitura de Marília (SP).
Hono + node:sqlite no servidor, React + MapLibre na interface, TypeScript nos dois lados.
Leia @README.md para o produto e @docs/arquitetura.md para a estrutura.

## Comandos
pnpm check        formatação, lint, tipos e testes (rode antes de dizer que terminou)
pnpm test         só vitest; um arquivo: pnpm exec vitest run src/server/x.test.ts
pnpm dev          servidor + vite em 5173
pnpm start:fresh  recria o banco em data/fogo.db
pnpm geo / roads  refazem data/marilia*.json (usam rede, demoram minutos; não rodar sem pedir)

## Estrutura
src/shared  tipos, catálogo de equipamentos (gera formulário e validação), geografia
src/server  API, simulador, seed, predictions/ (funções puras, um arquivo por modelo)
src/web     interface; mapa em map/, páginas em pages/

## Regras do dono
- Código, nomes de arquivos, commits e mensagens de erro técnicas em inglês.
- Texto da interface e documentação em português do Brasil, sem travessão, sem rótulos em negrito
  e sem marcas de texto de IA; passe pela skill humanizer antes de entregar.
- Nenhum comentário no código. Se precisar explicar, renomeie ou extraia.
- Toda tarefa traz testes, inclusive de erro e de borda. Quebre o código para ver o teste falhar.
- Commits convencionais em minúsculas, em inglês, sem co-autor de IA. Nunca em main direto.
- Sem dependência nova sem justificar. Versões exatas (.npmrc tem save-exact).

## Convenções do domínio
- Equipamento novo entra em src/shared/catalog.ts; formulário e validação derivam dele.
- O mapa usa a linguagem de sinalização viária (zebrado = crítico, tracejado = atenção, cinza = normal).
  Reaproveite os tokens de src/web/colors.ts e styles.css; não crie cor nova de status.
- Previsões não podem consultar o gerador de dados (src/server/seed); aprendem só do banco.
- O simulador acelera ocorrências 20x; os modelos descontam isso (FOGO_LIVE_MULTIPLIER).

## Teste no navegador
Use Claude in Chrome (skill u-chrome). Clique com JavaScript (element.click()) em vez de coordenadas.
O Chrome não redimensiona: para largura de celular, use iframes de 400px na mesma origem.
Pare o servidor de dev ao terminar.
```

Pontos a decidir antes de gravar: se a skill `u-code` e a `u-chrome` já cobrem as regras do dono, o bloco "Regras do dono" pode virar uma linha apontando para elas. A memória do projeto já registra "usar u-code aqui" e "iframes de 400px", então vale não duplicar nada que já esteja lá. A regra de "sem co-autor" e "minúsculas" é a que mais precisa estar escrita, porque o padrão do Claude Code é acrescentar um co-autor.

Conteúdo de `.claude/` proposto:

- `.claude/settings.json` (versionado). Permissões de leitura e das verificações: `allow` para `Bash(pnpm check)`, `Bash(pnpm test *)`, `Bash(pnpm exec vitest *)`, `Bash(pnpm typecheck)`, `Bash(pnpm lint)`, `Bash(pnpm format*)`, `Bash(git status)`, `Bash(git diff *)`, `Bash(git log *)`. `deny` para `Read(./.env)`, `Read(./.env.*)`, `Bash(rm -rf *)`, `Bash(git push *)`, `Bash(pnpm geo)` e `Bash(pnpm roads)` (consultam Overpass e ViaCEP e sobrescrevem `data/*.json`). `ask` para `Bash(pnpm install *)` e `Bash(pnpm add *)`, por causa da regra de justificar dependências. Incluir `"$schema": "https://json.schemastore.org/claude-code-settings.json"`.
- Hook `Stop` ou `PostToolUse` em `.claude/settings.json` chamando `pnpm exec oxfmt` e `pnpm exec oxlint --deny-warnings` após edição de `.ts`/`.tsx`. Hoje isso só acontece no commit via prek, tarde demais para a sessão corrigir. Um hook `PreToolUse` com matcher em `Edit|Write` pode recusar texto que contenha `//` em linha própria nos arquivos de `src/`, o que torna a regra de "sem comentários" imposta e não só pedida. Hooks de formatação devem ser rápidos; oxfmt e oxlint são.
- `.claude/rules/web.md` com `paths: ["src/web/**"]`: linguagem de sinalização, tokens de cor, textos em português revisados, acessibilidade (o `.oxlintrc.json` já liga `jsx-a11y`), mapa e MapLibre em `src/web/map/`.
- `.claude/rules/predictions.md` com `paths: ["src/server/predictions/**"]`: funções puras, um arquivo por modelo, testes com dados sintéticos, nada de ler o gerador, descontar o fator de aceleração.
- `.claude/skills/new-equipment-type/SKILL.md`: passo a passo para acrescentar um tipo ao catálogo (catálogo, seed, ícone/forma de marcador, teste de validação). É o único fluxo repetido que o código mostra.
- `.claude/skills/browser-check/SKILL.md` só se as regras de teste no navegador forem específicas do F.O.G.O. (portas 3210 e 5173, iframes de 400px). Se a skill global `u-chrome` já cobrir, não criar.
- `.claude/agents/`: nenhum subagente fixo é necessário. A documentação sugere um revisor em contexto novo, mas o skill `code-review` já faz isso. Criar um agente aqui seria duplicação.
- `.claude/commands/`: não criar.
- `.claude/settings.local.json` já existe e já está fora do git por regra global (`~/.config/git/ignore`). Acrescente `.claude/settings.local.json` ao `.gitignore` do projeto de qualquer forma, para quem clonar.

## Entrega do projeto

### O que o avaliador lê primeiro

Pelo que os projetos de outros participantes mostram (por exemplo stampini81/fogo-dsin-coder-challenge e Neitolas/fenix), a ordem de leitura esperada é: título e uma frase, captura de tela, como rodar em um comando, o que cobre cada parte do desafio, arquitetura, dados, uso de IA, testes. Isso é inferência a partir desses repositórios, não critério oficial. Um deles ainda traz roteiro de demonstração de dois minutos e uma tabela da API REST.

### README proposto

O README atual tem 120 linhas e o conteúdo está certo, mas a seção "Central de operações" tem parágrafos de mais de 10 linhas e a apresentação começa em texto corrido. Proposta de ordem, mantendo o conteúdo e cortando o que migrar para `docs/`:

1. Título, uma frase, três linhas dizendo as três partes do desafio.
2. Captura de tela da central de operações e um GIF curto (10 a 15 s) do mapa ao vivo. Um GIF de cinco segundos já prova que o sistema está vivo; o Claude in Chrome tem `gif_creator`.
3. Como rodar: `docker compose up --build` e o link; versão sem Docker; nota sobre internet para o mapa-base.
4. Roteiro de demonstração em 2 minutos: abrir a central, filtrar, clicar num marcador, ver o alerta, abrir a página de previsão, mostrar o backtest.
5. O que tem em cada parte: três seções curtas, de 6 a 10 linhas cada, apontando para `docs/` para o detalhe (velocidades de deslocamento, regras de cidade crítica, descrição dos modelos).
6. Arquitetura em um diagrama Mermaid e link para `docs/arquitetura.md`.
7. Dados e créditos (resumo) e link para `DATA.md` ou seção própria.
8. Configuração (a tabela de variáveis, já boa).
9. Testes e qualidade: `pnpm check`, o que o CI roda, número de testes.
10. Decisões e limitações: link para `docs/decisoes/` e lista curta de limites honestos (dados simulados, um único processo, sem autenticação, mapa-base exige rede, previsões treinadas em dados sintéticos).
11. Uso de IA (já existe; manter, mencionar o CLAUDE.md e como a revisão foi feita).
12. Licença.

Regras de estilo para o texto: português direto, sem travessão, sem rótulos em negrito, sem fechamentos de uma linha. O README atual já segue isso, então a revisão é de comprimento, não de tom.

### Conjunto de documentos

```
README.md
LICENSE
DATA.md                       fontes, licenças e como regenerar
docs/arquitetura.md           visão geral, C4 enxuto em Mermaid, fluxo de dados
docs/api.md                   tabela das rotas (hoje só existem no código)
docs/decisoes/0001-node-sqlite.md   um ADR curto por decisão
docs/decisoes/0002-sse-em-vez-de-websocket.md
docs/decisoes/0003-modelos-estatisticos-simples.md
docs/decisoes/0004-linguagem-de-sinalizacao.md
docs/imagens/                 capturas e GIF
```

ADRs: o formato MADR 4.0 tem versão mínima (título, contexto e problema, opções consideradas, decisão e consequências) e fica em `docs/decisions`. Para um projeto deste tamanho, use a versão mínima e escreva em português; quatro ADRs de uma página bastam. Temas que o código já sustenta: `node:sqlite` sem ORM e servidor rodando `.ts` direto no Node 24, SSE a cada 2 s em vez de WebSocket, previsão por estatística simples e explicável (Poisson, escore z, percentil) em vez de aprendizado de máquina, Voronoi para limites de bairro, aceleração de 20x no simulador com desconto nos modelos.

Arquitetura em C4 enxuto: dois diagramas Mermaid bastam, um de contexto (pessoa da prefeitura, F.O.G.O., OpenFreeMap, ViaCEP, Overpass só no build de dados) e um de contêineres (interface React, API Hono, SQLite, simulador, modelos de previsão). Mermaid renderiza no GitHub direto; a sintaxe `C4Context` do Mermaid ainda é experimental, então prefira `flowchart` com rótulos nos nós. Um terceiro diagrama de sequência para o fluxo simulador, banco, SSE e tela ajuda a explicar o "ao vivo".

Estrutura de pastas: `src/shared`, `src/server`, `src/web` já seguem a convenção comum para TypeScript fullstack sem monorepo, e os testes ao lado do código são coerentes. Não vale mover nada; só documentar.

### CI e Docker

- O CI hoje roda `pnpm check` e `pnpm build`. Faltam: `docker build` (para pegar Dockerfile quebrado), `actionlint` e `zizmor` nos workflows (regra global do dono), e um selo de status no README.
- No Dockerfile: não há `HEALTHCHECK`, e `COPY src ./src` leva os arquivos `*.test.ts` para a imagem final. Um `HEALTHCHECK` que chame uma rota existente e um `compose.yaml` com `healthcheck` e `restart: unless-stopped` melhoram a experiência de "subir e ver funcionando". O `.dockerignore` não exclui `.claude`, `docs` e `.github`, que só entram no estágio de build, mas inflam o contexto.
- A semente de dados já está resolvida: o seed determinístico (`FOGO_SEED`) cria 120 dias de histórico na primeira execução, sem passo manual. Isso é um ponto forte e merece uma frase no README.

### Licença e crédito de dados

- O projeto não tem LICENSE. Sem licença, o código fica com todos os direitos reservados por padrão. Para um desafio, MIT é o comum. A decisão é do dono.
- OpenStreetMap: dados derivados (bairros, ruas, pontos de referência em `data/marilia.json` e `data/marilia-roads.json`) devem reconhecer OpenStreetMap e seus colaboradores, indicar a licença ODbL e vincular a ela. Se o conjunto for redistribuído, a redistribuição segue a mesma licença. O README cita ODbL em uma frase; falta o link, a menção explícita a "colaboradores do OpenStreetMap" e um `DATA.md`.
- OpenFreeMap: a atribuição é exigida e o MapLibre a mostra sozinho. `src/web/map/base.ts` usa `attributionControl: { compact: true }`, que a mantém visível (recolhida num botão). Conferir na tela que o texto "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" aparece.
- ViaCEP: serviço consultado em tempo de uso e para conferir CEPs; mencionar como fonte.
- IBGE: se algum dado do IBGE (limites municipais, população) foi usado, não aparece no README nem no `package.json`. Se não foi, ignorar; se foi, citar a tabela e o ano.
- Fontes (`@fontsource/*`) têm licença OFL; basta manter os pacotes no `package.json`.

## Gaps no repositório hoje

- `/home/phav/Projects/fogo/CLAUDE.md`: não existe. Sem ele, as regras do dono (sem comentários, testes em toda tarefa, commit sem co-autor) dependem só da configuração global.
- `/home/phav/Projects/fogo/.claude/settings.json`: não existe. Só há `settings.local.json` com `enabledMcpjsonServers`. Sem permissões versionadas nem hook de verificação.
- `/home/phav/Projects/fogo/.claude/rules/`, `skills/`: não existem.
- `/home/phav/Projects/fogo/LICENSE`: não existe.
- `/home/phav/Projects/fogo/docs/`: não existia antes desta pesquisa. Faltam arquitetura, API, decisões e imagens.
- `/home/phav/Projects/fogo/README.md`: sem captura de tela nem GIF; sem diagrama; sem seção de limitações; sem selo do CI; a seção "Central de operações" mistura descrição de produto e regras de simulação em parágrafos longos (linhas 58 a 64 aproximadamente); referência ao Claude Opus 5.5 na seção "Uso de IA" deve ser conferida contra o que foi realmente usado.
- `/home/phav/Projects/fogo/.github/workflows/ci.yml`: sem `docker build`, sem `actionlint` e `zizmor`, sem artefato de cobertura. As ações já estão fixadas por hash e `permissions: contents: read` está correto.
- `/home/phav/Projects/fogo/Dockerfile`: sem `HEALTHCHECK`; copia testes para a imagem final. `/home/phav/Projects/fogo/compose.yaml`: sem `healthcheck` nem `restart`.
- `/home/phav/Projects/fogo/.gitignore`: não lista `.claude/settings.local.json`; hoje isso é coberto pelo ignore global do dono, mas não para quem clonar.
- `/home/phav/Projects/fogo/.pre-commit-config.yaml`: roda formatação, lint, tipos e testes, mas não checa mensagem de commit nem `actionlint`.
- `/home/phav/Projects/fogo/data/marilia.json` e `marilia-roads.json`: dados derivados do OSM versionados sem arquivo de crédito ao lado.
- Rotas da API em `src/server/routes/` (`inventory.ts`, `operations.ts`, `predictions.ts`) sem documentação fora do código.
- Pontos positivos verificados: nenhuma linha de comentário em `src/` e `scripts/`; nenhum `Co-Authored-By` no histórico; 18 commits convencionais em minúsculas; `.npmrc` com `save-exact`, `ignore-scripts` e `minimumReleaseAge`; testes ao lado dos módulos, incluindo cada modelo de previsão.

## Fontes

- Claude Code, memória e CLAUDE.md: https://code.claude.com/docs/en/memory
- Claude Code, boas práticas: https://code.claude.com/docs/en/best-practices (a URL anthropic.com/engineering/claude-code-best-practices redireciona para ela)
- Claude Code, arquivos de configuração e precedência: https://code.claude.com/docs/en/settings
- AGENTS.md: https://agents.md/
- CLAUDE.md do repositório anthropics/claude-code: https://github.com/anthropics/claude-code/blob/main/CLAUDE.md
- Guias de comunidade sobre CLAUDE.md (usados só para os padrões de estrutura): https://www.groff.dev/blog/implementing-claude-md-agent-skills, https://dometrain.com/blog/creating-the-perfect-claudemd-for-claude-code/, https://www.buildcamp.io/guides/the-ultimate-guide-to-claudemd
- MADR: https://adr.github.io/madr/ e https://github.com/adr/madr/tree/develop/template
- Direitos autorais do OpenStreetMap: https://www.openstreetmap.org/copyright
- OpenFreeMap: https://github.com/hyperknot/openfreemap
- OpenMapTiles: https://openmaptiles.org/docs/ e https://wiki.openstreetmap.org/wiki/OpenMapTiles
- Projetos de outros participantes (só para o formato do README): https://github.com/stampini81/fogo-dsin-coder-challenge, https://github.com/joojvitkk/dsin-coder-challenge-2026, https://github.com/Neitolas/fenix
- Site do desafio (403 ao acessar, sem critérios obtidos): https://appcoderchallenge.dsin.com.br/
