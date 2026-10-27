# FOGO

Dá para testar o FOGO no modo simulação em https://fogo-vspe.onrender.com, com o usuário `root` e a senha `root`. O site está no plano gratuito do Render, então pode demorar para abrir e ficar lento.

O FOGO (Ferramenta Onisciente de Gestão e Operações) é um sistema para prefeituras cadastrarem os equipamentos e agentes de trânsito e segurança, acompanharem a cidade em tempo real e anteciparem problemas. Serve para qualquer cidade: o administrador cadastra uma nova pelo próprio sistema, e várias cidades convivem no mesmo servidor. A simulação usa Marília (SP). Feito para a Etapa Bônus do DSIN Coder Challenge 2026.

## Como rodar

Com Docker:

```sh
docker compose up --build                         # simulação, com Marília e dados gerados
FOGO_MODE=production docker compose up --build    # produção, sem nenhum dado
```

Abra http://localhost:3210 e entre com `root` e a senha `root`. A simulação já vem com inventário, histórico e movimento. A produção começa vazia (a senha do `root` pode vir de `FOGO_ROOT_PASSWORD`), e cidade, zonas, bairros, órgãos, equipamentos, agentes e usuários são cadastrados pelas telas. O [docs/production.md](docs/production.md) explica a diferença entre os modos.

Para desenvolver, com Node.js 24 ou mais recente e pnpm 10:

```sh
pnpm install
docker compose up -d db
pnpm dev               # simulação em http://localhost:5173
pnpm dev:production    # produção
pnpm check             # formatação, lint, tipos e testes
```

## Central de operações

O mapa mostra ao vivo os equipamentos, os agentes em serviço, as ocorrências abertas e os bairros que pedem atenção. O painel ao lado resume a situação da cidade em uma frase, com as ocorrências sem equipe, os equipamentos parados e as manutenções urgentes, e lista os alertas e a situação de cada região.

A interface segue a sinalização viária. Zebrado vermelho é crítico, amarelo é atenção, e o que está normal fica em cinza. A forma do marcador também indica a situação do equipamento, para a informação não depender só da cor.

![Central de operações com o mapa de Marília e o painel com a situação da cidade](docs/images/operations.jpg)

Um clique em qualquer marcador abre os detalhes, com histórico e telemetria das últimas 48 horas. Um simulador faz o papel dos dispositivos IoT e acelera ocorrências e falhas para a demonstração ter movimento. Rastreadores reais, como um GPS ou uma placa ESP32, mandam a posição por uma rota própria, descrita em [docs/trackers.md](docs/trackers.md).

![Detalhe de um semáforo com mau funcionamento aberto sobre o mapa](docs/images/operations-detail.jpg)

## Inventário

São 12 tipos de equipamento, cada um com as suas características (a velocidade máxima de um radar, a resolução de uma câmera, a placa de um veículo de transporte). O cadastro tem endereço completo, busca de CEP e o ponto no mapa, e o bairro acompanha o ponto. Os agentes têm função, matrícula, órgão, turno, base e veículo.

![Lista de equipamentos com os parados por tipo, os filtros e a tabela](docs/images/equipment.jpg)

![Formulário de edição de uma câmera](docs/images/equipment-form.jpg)

![Lista de agentes com o efetivo por situação](docs/images/agents.jpg)

## Cidade preditiva

Os modelos aprendem só com os dados do banco. A página prevê as ocorrências por bairro nas próximas horas e sugere reforço de agentes por região. Também aponta leituras e concentrações fora do padrão, estima o risco de falha de cada equipamento em 7 dias e mostra as tendências de disponibilidade e de ocorrências.

![Ocorrências esperadas por bairro nas próximas horas](docs/images/predictive-city.jpg)

![Equipamentos com maior risco de falha em 7 dias](docs/images/failure-risk.jpg)

![Tendências de disponibilidade, ocorrências por região e uso dos equipamentos](docs/images/trends.jpg)

## Cidades, bairros e acesso

Uma cidade nova é criada em Gerenciamento a partir da lista do IBGE, com o limite do município trazido do OpenStreetMap. Os limites dos bairros são editados no mapa. O login tem dois perfis: administradores cadastram cidades e usuários, e usuários veem só as cidades atribuídas a eles.

![Editor de limites de bairro com o Centro de Marília selecionado](docs/images/neighborhoods.jpg)

No celular, a navegação vai para a barra inferior e o painel fica abaixo do mapa.

![Central de operações e Cidade preditiva em tela de celular](docs/images/mobile.jpg)

## Tecnologias

- TypeScript no servidor e na interface
- Node.js com Hono e validação com Zod
- PostgreSQL
- React, Vite e MapLibre GL, com o mapa de fundo do OpenFreeMap
- Server-Sent Events para os dados ao vivo
- Vitest, com PGlite nos testes de banco
- Docker e Docker Compose

## Dados

Os bairros, ruas e pontos de referência de Marília vêm do OpenStreetMap, e os CEPs foram conferidos no ViaCEP. Não existe base aberta com os limites oficiais dos bairros de Marília, então os do FOGO são aproximados e podem ser corrigidos no sistema. Equipamentos, agentes, ocorrências e telemetria da simulação são gerados, com padrões que a parte preditiva precisa descobrir sozinha. As fontes e licenças estão em [DATA.md](DATA.md).

## Configuração

| Variável               | Padrão          | Uso                                                                            |
| ---------------------- | --------------- | ------------------------------------------------------------------------------ |
| `PORT`                 | `3210`          | Porta HTTP                                                                     |
| `FOGO_MODE`            | `production`    | `simulation` ou `production`                                                   |
| `DATABASE_URL`         | depende do modo | `postgres://fogo:fogo@localhost:5432/fogo_simulation` ou `.../fogo_production` |
| `FOGO_ROOT_PASSWORD`   | `root`          | Senha do usuário `root`, usada só quando o banco está vazio                    |
| `FOGO_LIVE_MULTIPLIER` | `20`            | Aceleração de ocorrências e falhas, só na simulação                            |
| `FOGO_SEED`            | `20261027`      | Semente do gerador de dados                                                    |

## Uso de IA

O projeto foi desenvolvido com o Claude Code, usando o modelo Claude Opus 5.5, da Anthropic. As instruções dadas ao assistente estão em `CLAUDE.md` e na pasta `.claude/`.
