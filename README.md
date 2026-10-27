# FOGO

Ferramenta Onisciente de Gestão e Operações: um sistema para prefeituras cadastrarem os equipamentos e agentes de trânsito e segurança, acompanharem a cidade em tempo real e anteciparem problemas. Atende várias cidades no mesmo servidor, e a demonstração usa Marília (SP). Feito para a Etapa Bônus do DSIN Coder Challenge 2026.

Para rodar, basta ter o Docker:

```sh
docker compose up --build                            # simulação, com Marília e dados gerados
FOGO_MODE=production docker compose up --build       # produção, sem nenhum dado
```

Abra http://localhost:3210 e entre com o usuário `root` e a senha `root`. A simulação já vem com inventário, histórico e movimento. A produção começa vazia: entre com `root` e a senha `root` (ou a de `FOGO_ROOT_PASSWORD`), troque a senha e cadastre a cidade, as zonas, os bairros, os órgãos, os equipamentos, os agentes e os outros usuários. No Windows, o mesmo comando funciona no PowerShell com `$env:FOGO_MODE="production"; docker compose up --build`.

![Central de operações: mapa de Marília com equipamentos, agentes e ocorrências, e o painel com a situação da cidade](docs/images/operations.jpg)

O projeto cobre as três partes do desafio:

1. Inventário: cadastro de equipamentos (12 tipos, cada um com suas características) e de agentes.
2. Central de operações: mapa ao vivo, filtros, alertas e situação de cada região.
3. Cidade preditiva: ocorrências esperadas por bairro, reforço de agentes, comportamentos fora do padrão, risco de falha dos equipamentos e tendências.

## Como rodar

O FOGO tem dois modos. A simulação gera dados e movimento para apresentar o sistema. A produção começa com o banco vazio e depende de cadastros e dispositivos reais. O [docs/production.md](docs/production.md) explica a diferença e o plano para a operação real.

O banco é PostgreSQL. O `compose.yaml` sobe o banco (`db`) e o FOGO (`app`). Cada modo usa um banco próprio no mesmo servidor, `fogo_simulation` e `fogo_production`, e o FOGO não abre um banco do outro modo. Os dados ficam no volume `postgres-data`. Para apagar tudo e recomeçar, use `docker compose down -v`.

Para desenvolver, com Node.js 24 ou mais recente e pnpm 10, suba só o banco e rode o servidor com recarga automática:

```sh
pnpm install
docker compose up -d db
pnpm dev               # simulação em http://localhost:5173
pnpm dev:production    # produção
```

Na simulação, a primeira execução cria as tabelas, importa Marília e gera 120 dias de histórico, o que leva alguns segundos. Para começar do zero, use `pnpm start:fresh`. Sem Docker, aponte `DATABASE_URL` para um PostgreSQL seu. A rota `/api/health` responde quando o servidor e o banco estão de pé, e é ela que o `HEALTHCHECK` do contêiner usa.

Para publicar no Render, crie um Blueprint a partir do repositório: o `render.yaml` sobe o FOGO em modo simulação com um PostgreSQL gratuito e liga o `DATABASE_URL` entre os dois. No plano gratuito o serviço dorme após 15 minutos sem acesso, e a simulação para enquanto ele dorme. O banco gratuito expira 30 dias após a criação; para mantê-lo, aponte `DATABASE_URL` para outro PostgreSQL.

O mapa de ruas vem do OpenFreeMap e precisa de internet. Sem conexão, o sistema continua funcionando e mostra só os bairros e os marcadores sobre fundo liso.

## Roteiro de demonstração (2 minutos)

1. Abra a Central. No painel da direita, leia a situação de Marília (normal, atenção ou crítico), o motivo e os três números de ação.
2. Clique em "equipamentos parados": o mapa passa a mostrar só eles. Clique de novo para voltar. Abra "Camadas e legenda" para ver o que cada forma, cor e padrão quer dizer.
3. Clique num marcador de equipamento, num agente e numa ocorrência para abrir os detalhes, com histórico e telemetria das últimas 48 horas.
4. Na aba Alertas, localize um alerta no mapa pelo título e reconheça outro. Na aba Regiões, veja quais regiões e bairros pedem atenção. A aba Atividade resume o que mudou desde a sua última visita e lista as últimas 24 horas. Clique num bairro no mapa para ver os equipamentos parados e os agentes livres mais próximos, com o tempo estimado de chegada.
5. Em Equipamentos, clique num tipo de "Parados por tipo", filtre por situação e abra a ficha de um item. Cadastre um equipamento novo: o botão "Buscar CEP" preenche o endereço e o clique no mapa ajusta o ponto e o bairro.
6. Em Cidade preditiva, troque o horizonte em "Próximas horas", clique num bairro marcado como acima do normal e leia o número esperado, a faixa e o motivo. Passe pelas abas Fora do padrão, Equipamentos e Tendências.
7. No menu Configurações, abra Cidades e cadastre outra cidade: escolha a UF e o município, confira o limite trazido do OpenStreetMap e salve. O seletor do topo passa a trocar entre as duas.

![Cidade preditiva: ocorrências esperadas por bairro, com os bairros acima do normal marcados no mapa](docs/images/predictive-city.jpg)

## O que tem em cada parte

### Inventário

Cada equipamento guarda número de série, marca, modelo, órgão responsável, situação, data de instalação, endereço completo (UF, cidade, CEP, rua, referência como "KM 12" ou "em frente ao Supermercado X" e bairro), coordenadas GPS, necessidade de manutenção (nenhuma, agendada ou imediata), periodicidade e datas da última e da próxima manutenção. UF e cidade se escolhem entre as cidades cadastradas no FOGO, e o ponto precisa cair dentro do limite da cidade escolhida. Os órgãos responsáveis são cadastrados por cidade, na tela Órgãos.

As características mudam conforme o tipo. Um radar tem o tipo de fiscalização e a velocidade máxima; uma câmera tem visão noturna, resolução, imagem colorida ou preto e branco, PTZ e leitura de placas; um veículo de transporte tem serviço (táxi, mototáxi ou escolar), placa e alvará. Os tipos e seus campos ficam em `src/shared/catalog.ts`, e o mesmo catálogo gera o formulário e a validação no servidor.

O botão "Buscar CEP" preenche rua, bairro e coordenadas, primeiro pela base local e depois pelo ViaCEP, e avisa quando o CEP é de outra cidade. O ponto pode ser ajustado clicando no mapa ou arrastando o marcador, e o bairro acompanha o ponto.

Os agentes (agentes de trânsito, guardas municipais e policiais militares) têm matrícula, órgão, graduação, turno, base, situação e o veículo que usam.

As listas de equipamentos e de agentes têm a mesma estrutura: uma linha curta de atalhos (os tipos com algo parado, ou o efetivo por situação), uma barra de filtros e uma tabela de largura total. A manutenção aparece como "amanhã", "em 5 dias" ou "vencida há 12 dias", com cor só quando vence em até 7 dias.

![Lista de equipamentos com a linha de parados por tipo, a barra de filtros e a tabela](docs/images/equipment.jpg)

### Central de operações

O mapa ocupa quase toda a tela e mostra:

- os bairros que pedem atenção com contorno tracejado, como faixa de pista, e os críticos com zebrado vermelho;
- os equipamentos agrupados quando estão próximos, com um selo vermelho que conta os parados de cada grupo e um selo com chave inglesa nos que precisam de manutenção urgente ou nos próximos 7 dias;
- os agentes em serviço, com um símbolo por função (cone para agente de trânsito, estrela para guarda municipal, quepe para policial militar) e uma linha pontilhada até a ocorrência que atendem;
- as ocorrências abertas, que pulsam enquanto esperam equipe;
- um mapa de calor opcional das ocorrências dos últimos 30 dias.

A interface usa a linguagem da sinalização viária. O zebrado vermelho marca o que é crítico e o amarelo marca o que pede atenção: uma faixa contínua nos alertas e nas listas, e o contorno tracejado, como faixa de pista, nos bairros do mapa. Botões e seleção usam a tinta escura, para o amarelo ficar só com a atenção. Só os problemas ganham cor: equipamentos operacionais e agentes disponíveis ficam em cinza, como recomenda a norma ISA-101 para telas de salas de controle. A forma do marcador também indica a situação do equipamento, como nas placas de trânsito, para que a informação não dependa só da cor: círculo para operacional, losango para mau funcionamento, quadrado para manutenção, octógono para furtado e contorno para não instalado ou desativado.

A barra de filtros fica sobre o mapa, com busca, situação, tipo e, em "Mais filtros", região, bairro, órgão e manutenção. O painel da direita começa pela situação de Marília e o motivo em uma frase, ideia tirada dos estágios operacionais do Centro de Operações do Rio. Logo abaixo vêm as ocorrências sem equipe, os equipamentos parados e as manutenções urgentes; os dois últimos filtram o mapa. O painel tem uma aba de alertas e outra com a situação de cada região.

Os níveis seguem a ideia de que só pede atenção o que pede ação:

- um bairro ou região fica crítico com ocorrência crítica sem equipe, duas ou mais ocorrências graves sem equipe ou disponibilidade de equipamentos abaixo de 60%;
- fica em atenção com uma ocorrência grave sem equipe, disponibilidade abaixo de 85% ou ocorrências acumuladas (no bairro, 2 graves em atendimento ou 3 abertas; na região, 4 e 10);
- a cidade fica crítica quando alguma região está crítica ou há ocorrência crítica esperando equipe, e pede atenção quando alguma região pede, quando alguma ocorrência espera equipe ou quando há alerta crítico ainda não reconhecido. Um bairro com concentração incomum de ocorrências na última hora fica em atenção.

Os alertas seguem a norma ISA-18.2: crítico é o que pede ação agora, como ocorrência sem equipe, semáforo apagado ou concentração incomum de ocorrências. Um crítico ativo há mais de 24 horas vira aviso. Alertas iguais de equipamento e manutenção aparecem agrupados, e cada item do grupo pode ser localizado no mapa e reconhecido.

Os dados chegam por Server-Sent Events a cada 2 segundos. Um simulador faz o papel dos dispositivos IoT: movimenta agentes e veículos, gera ocorrências segundo o padrão histórico de cada bairro, despacha o agente disponível que chega mais rápido, registra falhas, reparos, manutenções preventivas, furtos, reposições e quedas de comunicação, e acumula as contagens dos sensores. Para a demonstração ter movimento, ocorrências e falhas acontecem 20 vezes mais rápido que na vida real, com as mesmas taxas por equipamento do histórico. Os modelos de previsão descontam essa aceleração.

Dispositivos de verdade entram por tags. Na ficha de um equipamento ou agente, o gestor cria uma tag e grava o ID e o token num GPS ou numa placa como o ESP32, que passa a mandar a posição para `POST /api/tags/{id}/location`. O simulador deixa de mover esse cadastro e de inventar o sinal de vida dele. O passo a passo, o contrato da rota e um exemplo para ESP32 estão em [docs/trackers.md](docs/trackers.md).

O deslocamento não é acelerado e segue as ruas. Agentes a pé andam a 4,5 km/h na ronda e a 7 km/h a caminho de uma ocorrência. Viaturas e motos patrulham a 30 km/h e vão a um chamado a até 60 e 65 km/h. Táxis e mototáxis rodam a 40 km/h, o veículo de fiscalização a 15 km/h e os patinetes a 15 ou 20 km/h, conforme o limitador. Veículos respeitam a mão de direção e o limite de cada trecho; só viaturas e motos em atendimento passam um pouco do limite. O despacho só considera quem chega em até 20 minutos.

### Bairros

A tela Bairros mostra o limite de cada bairro da cidade selecionada sobre o mapa. Dá para arrastar os pontos, criar um ponto novo puxando o meio de uma linha, apagar um ponto com dois cliques ou redesenhar o bairro do zero, além de mudar o nome e a zona. O limite fica salvo no banco e vale na hora para a Central, as previsões e a escolha de bairro de equipamentos e ocorrências novos. Linhas que se cruzam e pontos longe da cidade são recusados, e nos bairros importados "Restaurar original" volta ao limite gerado a partir do OpenStreetMap. "Novo bairro" cria um bairro com nome, zona e limite desenhado no mapa. O botão Zonas cadastra, renomeia e exclui as zonas que agrupam os bairros. Bairros e zonas só podem ser excluídos quando nada depende deles.

### Cidades, usuários e acesso

O FOGO pede login nos dois modos. O servidor cria o usuário `root` quando o banco não tem usuários. Na produção, a senha é a de `FOGO_ROOT_PASSWORD` ou, sem ela, `root`, e se troca em Minha senha. Na simulação, a senha é sempre `root`, e a tela de entrada lembra disso. Há dois perfis. Administradores cadastram cidades e usuários e veem todas as cidades. Usuários veem só as cidades que um administrador atribuiu a eles e usam o resto do sistema, inclusive zonas, bairros e órgãos. A sessão fica num cookie `HttpOnly`, as senhas são guardadas com scrypt e o login trava por 15 minutos depois de 10 tentativas erradas.

Uma cidade nova nasce em Cidades: o administrador escolhe a UF e o município na lista do IBGE, e o servidor busca o limite do município no OpenStreetMap para conferência. Se o limite não vier, ele é desenhado à mão. Depois disso a cidade começa vazia, e tudo o que a simulação cria sozinha (zonas, bairros, órgãos, equipamentos e agentes) é cadastrado pelas telas. O seletor no topo troca a cidade de todo o sistema e fica lembrado por usuário.

### Cidade preditiva

A página tem uma aba por pergunta, e cada bloco diz o que está sendo previsto, como usar o resultado e, recolhido, com quais dados. Os modelos aprendem com os dados do banco; nenhum deles consulta o gerador de dados.

- Próximas horas, ocorrências esperadas por bairro: combina a participação de cada bairro em cada tipo de ocorrência, o padrão da cidade por dia da semana e hora (12 semanas, com peso maior para as recentes) e a tendência das duas últimas semanas, e aumenta quando câmeras, radares ou semáforos do bairro estão parados. Cada bairro mostra o número esperado e a faixa em que ele cai em 8 de cada 10 dias parecidos. O mapa marca só os bairros acima do próprio normal para aquele dia e horário: tracejado a partir de 20% acima, zebrado a partir de 50%.
- Próximas horas, reforço de agentes: compara a carga prevista de cada região (ocorrências vezes o tempo médio de atendimento) com o efetivo ativo, mostra o saldo de cada uma e sugere remanejamentos.
- Próximas horas, padrão semanal: um mapa de calor com as ocorrências esperadas por dia e hora.
- Próximas horas, qualidade do modelo: um teste retroativo treina o modelo sem os últimos 7 dias e compara a previsão com o que aconteceu. Na base de demonstração, medida em 23/10/2026 em seis janelas de 7 dias com duas sementes, os 10% de blocos de 4 horas apontados como mais arriscados concentram entre 15% e 22% das ocorrências, contra 11% a 16% da média histórica simples. O erro por região fica entre 7% e 21% menor. A tela mostra o teste da janela mais recente.
- Fora do padrão: sensores com leitura zerada, quedas e picos de fluxo (escore z contra o mesmo horário das quatro semanas anteriores) e concentrações de ocorrências (teste de Poisson contra o esperado).
- Equipamentos, risco de falha em 7 dias: estima, pelo histórico, a taxa de falha de cada tipo de equipamento e quanto a manutenção vencida aumenta essa taxa. Com isso monta a fila de manutenção preventiva.
- Tendências: disponibilidade por tipo de equipamento com projeção de 30 dias e a faixa em que ela deve ficar em 8 de cada 10 casos, ocorrências por região e uso de totens, cancelas e sensores de fluxo. Dias em que o servidor ficou desligado não contam como queda. Só viram aviso as variações estatisticamente significativas.

## Arquitetura

```mermaid
flowchart LR
  gestor["Gestor no navegador"] --> web["Interface React + MapLibre"]
  web -- "REST /api" --> api["API Hono"]
  api -- "SSE a cada 2 s" --> web
  api --> db[("PostgreSQL")]
  sim["Simulador IoT"] --> db
  tag["Rastreadores (tags)"] -- "POST /api/tags/{id}/location" --> api
  sim --> hub["Hub ao vivo"]
  hub --> api
  pred["Modelos de previsão"] --> db
  api --> pred
  web -. "mapa de fundo" .-> ofm["OpenFreeMap"]
  api -. "Buscar CEP" .-> viacep["ViaCEP"]
  api -. "nova cidade" .-> ibge["IBGE e Nominatim (OSM)"]
  scripts["pnpm geo, roads, boundaries"] -. "uma vez" .-> osm["OpenStreetMap (Overpass)"]
  scripts --> geo["data/marilia*.json"]
  geo -. "semente da simulação" .-> db
```

O servidor é um único processo Node.js que roda direto dos arquivos `.ts`. Ele serve a API, a interface já compilada e o fluxo ao vivo, e roda o simulador no mesmo processo. Cada cidade tem o próprio fluxo ao vivo e o próprio cache de previsões. O esquema do banco evolui por migrações numeradas em `src/server/migrations`, aplicadas quando o servidor sobe. Os modelos de previsão são funções puras que recebem os registros do banco e guardam o resultado em cache por alguns minutos.

## Dados

Os bairros, ruas e pontos de referência de Marília vêm do OpenStreetMap (licença ODbL), e os CEPs foram conferidos no ViaCEP. A base fica em `data/marilia.json` e `data/marilia-roads.json` e é refeita em três passos, nesta ordem, todos com internet. `pnpm geo` busca bairros, ruas, CEPs e pontos de referência e leva uns quatro minutos por causa do intervalo entre consultas ao ViaCEP. `pnpm roads` baixa a malha viária, com mão de direção e limite de velocidade de cada trecho, usada no deslocamento dos agentes. `pnpm boundaries` desenha os limites dos bairros.

Não existe base aberta com os limites oficiais dos bairros de Marília, então os limites do FOGO são aproximados e não valem como divisa legal. Cada rua fica com o bairro mais próximo pela malha viária, e a área em volta das ruas é dividida a partir daí, sem atravessar rios, córregos e a ferrovia. Os seis bairros e distritos que têm polígono no OpenStreetMap (Jardim Vitória, Jardim Vista Alegre, Lácio, Padre Nóbrega, Jardim Julieta e Oswaldo Fanceli) usam esse polígono, sem tomar a área dos bairros que ficam dentro deles. Na simulação, essa base é importada para o banco na primeira carga e pode ser corrigida na tela Bairros. A produção não usa esses arquivos.

As licenças e os créditos de cada fonte estão em [DATA.md](DATA.md).

Equipamentos, agentes, histórico de ocorrências e telemetria são simulados. O gerador cria padrões que um sistema real teria: picos de trânsito no começo da manhã e no fim da tarde, mais ocorrências de segurança nas noites de sexta e sábado, bairros comerciais com mais estacionamento irregular, equipamentos com manutenção atrasada falhando mais, uma frota de patinetes envelhecendo e alguns bairros com ocorrências em alta nas últimas semanas. A parte preditiva precisa descobrir esses padrões sozinha.

## Configuração

| Variável               | Padrão          | Uso                                                                            |
| ---------------------- | --------------- | ------------------------------------------------------------------------------ |
| `PORT`                 | `3210`          | Porta HTTP                                                                     |
| `FOGO_MODE`            | `production`    | `simulation` ou `production`                                                   |
| `DATABASE_URL`         | depende do modo | `postgres://fogo:fogo@localhost:5432/fogo_simulation` ou `.../fogo_production` |
| `FOGO_ROOT_PASSWORD`   | `root`          | Senha do usuário `root`, usada só quando o banco está vazio                    |
| `FOGO_LIVE_MULTIPLIER` | `20`            | Aceleração de ocorrências e falhas, só na simulação                            |
| `FOGO_SEED`            | `20261027`      | Semente do gerador de dados                                                    |

No Compose, `POSTGRES_PASSWORD` (padrão `fogo`), `POSTGRES_PORT` (padrão `5432`) e `PORT` mudam a senha do banco e as portas expostas.

## Código e testes

TypeScript nos dois lados. O servidor usa Hono, PostgreSQL pelo `pg` com SQL escrito à mão e Zod para validação. A interface usa React, Vite e MapLibre GL, com gráficos em SVG feitos à mão.

```
src/shared/   tipos, catálogo de equipamentos, geografia, horário e plural em português
src/server/   API, banco, simulador, gerador de dados (seed/) e modelos de previsão (predictions/)
src/web/      interface: páginas em pages/, componentes em components/, mapa em map/
scripts/      geração da base geográfica, malha viária e limites de bairro, e servidor de desenvolvimento
data/         base geográfica e malha viária de Marília, usadas pela simulação
docker/       script que cria o banco de produção no Postgres do Compose
docs/         capturas de tela, rastreadores, modos de execução e a pesquisa que orientou a interface
```

```sh
pnpm check    # formatação, lint, tipos e testes
pnpm test     # só os testes
```

São mais de 330 testes com Vitest: regras de alerta e de nível, modelos de previsão com dados sintéticos (inclusive séries com lacuna), simulador, semente, API, login e perfis, cidades, limites de bairro e as funções de formatação e filtro da interface. Os testes de banco rodam no PGlite, um Postgres em memória, e por isso `pnpm check` não precisa de Docker. Os hooks do prek rodam formatação, lint e tipos a cada commit e os testes a cada push (`prek install --hook-type pre-commit --hook-type pre-push`). O GitHub Actions roda `pnpm check`, o build e o `docker build` a cada push.

## Limitações

- Na simulação, equipamentos, agentes, ocorrências e telemetria são inventados, com exceção dos cadastros que têm tag, e os modelos foram avaliados nessa base. A produção ainda não tem despacho, app do agente nem telemetria dos equipamentos fixos; o plano está em [docs/production.md](docs/production.md). Com dados reais, os limiares e a qualidade precisariam ser medidos de novo.
- O registro de alterações (`audit_log`) guarda usuário, método, caminho e horário de cada mudança, mas ainda não há tela para consultá-lo; só o administrador lê pela rota `/api/audit`. O limite de leituras por tag e por endereço fica na memória do processo.
- O servidor roda num único processo, com o simulador e os fluxos ao vivo em memória, e por isso não escala horizontalmente.
- O mapa de fundo depende de internet; sem ela aparecem só os bairros e os marcadores.
- Os limites de bairro são aproximados (ver Dados). Mudar o limite de um bairro não muda o bairro gravado em equipamentos, agentes e ocorrências que já existiam.

## Uso de IA

O projeto foi desenvolvido com o Claude Code, usando o modelo Claude Opus 5.5, da Anthropic. As instruções dadas ao assistente (comandos, regras de código e da interface, convenções do domínio) estão em `CLAUDE.md` e na pasta `.claude/`.
