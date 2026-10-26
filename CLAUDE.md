# FOGO

Inventário, central de operações e previsões para a prefeitura de Marília (SP), feito para a Etapa Bônus do DSIN Coder Challenge 2026. Hono e `node:sqlite` no servidor, React e MapLibre na interface, TypeScript nos dois lados. O `README.md` explica o produto e as decisões; o `DATA.md` lista a origem e a licença dos dados.

## Comandos

```
pnpm check          formatação, lint, tipos e testes; rode antes de dar algo por terminado
pnpm exec vitest run src/server/operations.test.ts    um arquivo de teste
pnpm dev            simulação: API em 3210 e Vite em 5173, com recarga
pnpm dev:production o mesmo em modo produção, com data/fogo-production.db
pnpm start:fresh    recria data/fogo.db a partir da semente
pnpm geo, pnpm roads, pnpm boundaries    refazem data/marilia*.json nessa ordem
```

Os três últimos consultam Overpass e ViaCEP, levam minutos e reescrevem a base geográfica. Rode só quando a tarefa for mudar a geografia.

## Estrutura

```
src/shared   tipos, catálogo de equipamentos, geografia, horário de Marília
src/server   API, simulador, semente (seed/), previsões (predictions/)
src/web      interface; mapa em map/, páginas em pages/, componentes em components/
scripts      geração da base geográfica, servidor de dev e o verificador de comentários
```

## Domínio

- Um tipo de equipamento nasce em `src/shared/catalog.ts`; formulário e validação derivam dele. A skill `new-equipment-type` tem o passo a passo.
- A interface usa a sinalização viária: zebrado vermelho é crítico, tracejado amarelo é atenção, cinza é normal. Cor só aparece em problema. Reaproveite `src/web/colors.ts` e os tokens de `styles.css`.
- As previsões aprendem só com o banco e nunca leem a semente. O simulador acelera ocorrências e falhas (`FOGO_LIVE_MULTIPLIER`, 20 por padrão) e os modelos descontam isso.
- Os limites dos bairros são aproximados a partir da malha viária do OpenStreetMap, não são os legais. Crédito do OSM no mapa e no `DATA.md`. Eles vão para a tabela `neighborhood_shapes` na primeira carga, a tela Bairros edita, e `src/server/neighborhoods.ts` aplica o que está no banco sobre `city` ao subir o servidor.
- Dois modos (`FOGO_MODE`, `src/server/config.ts`): simulação gera semente e liga o simulador; produção começa vazia, sem simulador e sem aceleração. Um banco não abre no modo errado. O plano para a operação real está em `docs/production.md`.
- Rotas da interface, parâmetros de URL e nomes de arquivo ficam em inglês; textos para o usuário em português.
- Dispositivos reais mandam posição por tag (`POST /api/tags/{id}/location`, token no cabeçalho). O simulador ignora quem tem tag. O contrato está em `docs/trackers.md`.

## Navegador

Teste a interface no Chrome com cliques via JavaScript. A janela não redimensiona: para largura de celular, use iframes de 400px na mesma origem. Cada aba ou iframe do app segura uma conexão de SSE e o Chrome aceita seis por servidor, então mantenha uma aba do app por vez e feche os iframes logo depois.
