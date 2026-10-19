# F.O.G.O.

Ferramenta Onisciente de Gestão e Operações: um sistema para a prefeitura de Marília (SP) cadastrar os equipamentos e agentes de trânsito e segurança, acompanhar a cidade em tempo real e antecipar problemas. Feito para a Etapa Bônus do DSIN Coder Challenge 2026.

O projeto cobre as três partes do desafio:

1. Inventário: cadastro de equipamentos (12 tipos, cada um com suas características próprias) e de agentes.
2. Central de operações: mapa ao vivo, indicadores, filtros, alertas e situação de cada região.
3. Cidade preditiva: risco por bairro e horário, reforço de agentes, anomalias, risco de falha dos equipamentos e tendências.

## Como rodar

Com Docker:

```sh
docker compose up --build
```

Sem Docker, com Node.js 24 ou mais recente e pnpm 10:

```sh
pnpm install
pnpm build
pnpm start
```

Depois abra http://localhost:3210.

Na primeira execução o servidor cria o banco SQLite em `data/fogo.db` e gera 120 dias de histórico. Isso leva cerca de um segundo. Para começar do zero, use `pnpm start:fresh`.

Para desenvolver com recarga automática, rode `pnpm dev` e abra http://localhost:5173.

O mapa de ruas vem do OpenFreeMap e precisa de internet. Sem conexão, o sistema continua funcionando e mostra apenas os bairros e marcadores sobre fundo liso.

## O que tem em cada parte

### Inventário

Cada equipamento guarda número de série, marca, modelo, órgão responsável, situação, data de instalação, endereço completo (CEP, rua, referência como "KM 12" ou "em frente ao Supermercado X", bairro, cidade/UF), coordenadas GPS, necessidade de manutenção (nenhuma, agendada ou imediata), periodicidade e datas da última e da próxima manutenção.

As características mudam conforme o tipo. Um radar tem o tipo de fiscalização e a velocidade máxima; uma câmera tem visão noturna, resolução, imagem colorida ou preto e branco, PTZ e leitura de placas; um veículo de transporte tem serviço (táxi, mototáxi ou escolar), placa e alvará. Os tipos e seus campos ficam em `src/shared/catalog.ts`, e o mesmo catálogo gera o formulário e a validação no servidor.

O botão "Buscar CEP" preenche rua, bairro e coordenadas, primeiro pela base local e depois pelo ViaCEP. O ponto pode ser ajustado clicando no mapa ou arrastando o marcador.

Os agentes (agentes de trânsito, guardas municipais e policiais militares) têm matrícula, graduação, turno, base, situação e o veículo que usam.

As listas de equipamentos e de agentes começam com um resumo: a frota por tipo, com quantos estão parados, e o efetivo por situação. Clicar em um desses cartões filtra a lista.

### Central de operações

A tela inicial mostra o mapa de Marília com:

- os bairros que pedem atenção com contorno tracejado, como faixa de pista, e os críticos com zebrado vermelho;
- os equipamentos agrupados quando estão próximos, com um selo vermelho que conta os parados de cada grupo;
- os agentes em serviço, com uma linha pontilhada até a ocorrência que cada um atende;
- as ocorrências abertas, que pulsam enquanto esperam equipe;
- um mapa de calor opcional das ocorrências dos últimos 30 dias.

A interface usa a linguagem da sinalização viária. O zebrado marca o que é crítico (bairros, alertas e indicadores) e o tracejado marca o que pede atenção. A situação de cada equipamento aparece pela cor e também pela forma do marcador, como nas placas de trânsito: círculo para operacional, losango para mau funcionamento, quadrado para manutenção, octógono para furtado e contorno para não instalado ou desativado. Assim a informação não depende só da cor. A legenda fica junto das camadas, no canto do mapa.

No topo ficam os indicadores: total de equipamentos, disponibilidade, operacionais, indisponíveis, agentes em atividade, ocorrências abertas e manutenções urgentes. À esquerda ficam a busca e o filtro de situação, com tipo, região, bairro, órgão e manutenção em "Mais filtros", e logo abaixo a situação de cada região. À direita fica a lista de alertas, que podem ser reconhecidos ou localizados no mapa. Clicar em qualquer marcador abre os detalhes, com histórico de situação e a telemetria das últimas 48 horas.

Os dados chegam por Server-Sent Events a cada 2 segundos. Um simulador faz o papel dos dispositivos IoT: movimenta agentes e veículos, gera ocorrências segundo o padrão histórico de cada bairro, despacha o agente disponível que chega mais rápido, registra falhas, reparos, manutenções preventivas, furtos e quedas de comunicação, e acumula as contagens dos sensores. Para a demonstração ter movimento, ocorrências e falhas acontecem 20 vezes mais rápido que na vida real. Os modelos de previsão descontam essa aceleração.

O deslocamento não é acelerado e segue as ruas. Agentes a pé andam a 4,5 km/h na ronda e a 7 km/h a caminho de uma ocorrência. Viaturas e motos patrulham a 30 km/h e vão a um chamado a até 60 e 65 km/h. Táxis e mototáxis rodam a 40 km/h, o veículo de fiscalização a 15 km/h e os patinetes a 15 ou 20 km/h, conforme o limitador. Veículos respeitam a mão de direção e o limite de cada trecho; só viaturas e motos em atendimento passam um pouco do limite. O despacho só considera quem chega em até 20 minutos.

### Cidade preditiva

Cada bloco da página explica o que está sendo previsto, com quais dados e como usar o resultado. Os modelos aprendem com os dados do banco. Nenhum deles consulta o gerador de dados. O horizonte da previsão fica fixo no topo da página e vale para o risco por bairro e para o reforço de agentes.

- Risco por bairro nas próximas horas: combina a participação de cada bairro em cada tipo de ocorrência, o padrão da cidade por dia da semana e hora (12 semanas, com peso maior para as recentes) e a tendência das duas últimas semanas. O resultado é pesado pela gravidade típica de cada tipo e aumenta quando câmeras, radares ou semáforos do bairro estão parados. O índice de 0 a 100 é o percentil do bairro neste horário entre todos os bairros e horários da semana.
- Reforço de agentes: compara a carga prevista de cada região (ocorrências vezes o tempo médio de atendimento) com o efetivo ativo, mostra o saldo de cada uma e sugere remanejamentos.
- Padrão semanal: um mapa de calor com as ocorrências esperadas por dia e hora.
- Qualidade do modelo: um backtest treina o modelo de risco sem os últimos 7 dias e compara a previsão com o que aconteceu. Na base de demonstração, os 10% de blocos de 4 horas apontados como mais arriscados concentram entre 17% e 24% das ocorrências, contra cerca de 10% da média histórica simples. O erro por região fica cerca de 15% menor.
- Comportamentos fora do padrão: sensores com leitura zerada, quedas e picos de fluxo (escore z contra o mesmo horário das quatro semanas anteriores) e concentrações de ocorrências (teste de Poisson contra o esperado).
- Risco de falha em 7 dias: estima, pelo histórico, a taxa de falha de cada tipo de equipamento e quanto a manutenção vencida aumenta essa taxa. Com isso monta a fila de manutenção preventiva.
- Tendências: disponibilidade por tipo de equipamento com projeção de 30 dias, ocorrências por região e uso de totens, cancelas e sensores de fluxo. Só viram aviso as variações estatisticamente significativas.

## Dados

Os bairros, ruas e pontos de referência de Marília vêm do OpenStreetMap (licença ODbL), e os CEPs foram conferidos no ViaCEP. O script `pnpm geo` refaz a base em `data/marilia.json`. Ele precisa de internet e leva uns quatro minutos por causa do intervalo entre consultas ao ViaCEP. Os limites dos bairros são células de Voronoi em torno dos pontos de cada bairro, recortadas pelo contorno urbano.

A malha viária usada no deslocamento fica em `data/marilia-roads.json`, com mão de direção e limite de velocidade de cada trecho. O script `pnpm roads` refaz o arquivo. Rode depois do `pnpm geo`, porque ele recorta as ruas pelo contorno urbano de `data/marilia.json`.

Equipamentos, agentes, histórico de ocorrências e telemetria são simulados. O gerador cria padrões que um sistema real teria: picos de trânsito no começo da manhã e no fim da tarde, mais ocorrências de segurança nas noites de sexta e sábado, bairros comerciais com mais estacionamento irregular, equipamentos com manutenção atrasada falhando mais, uma frota de patinetes envelhecendo e alguns bairros com ocorrências em alta nas últimas semanas. A parte preditiva precisa descobrir esses padrões sozinha.

## Configuração

| Variável               | Padrão         | Uso                                                     |
| ---------------------- | -------------- | ------------------------------------------------------- |
| `PORT`                 | `3210`         | Porta HTTP                                              |
| `FOGO_DB`              | `data/fogo.db` | Caminho do banco SQLite                                 |
| `FOGO_LIVE_MULTIPLIER` | `20`           | Aceleração de ocorrências e falhas na simulação ao vivo |
| `FOGO_SIMULATION`      | ligada         | Use `off` para desligar o simulador                     |
| `FOGO_SEED`            | `20261027`     | Semente do gerador de dados                             |

## Código

TypeScript nos dois lados. O servidor usa Hono, o SQLite embutido no Node.js (`node:sqlite`) e Zod para validação, e roda direto dos arquivos `.ts`, sem etapa de compilação. A interface usa React, Vite e MapLibre GL, com gráficos em SVG feitos à mão.

```
src/shared/   tipos, catálogo de equipamentos, geografia e horário de Marília
src/server/   API, banco, simulador, gerador de dados e modelos de previsão
src/web/      interface
scripts/      geração da base geográfica e da malha viária, e servidor de desenvolvimento
data/         base geográfica e malha viária de Marília (o banco também fica aqui)
```

Os modelos de previsão ficam em `src/server/predictions/`, um arquivo por modelo, todos como funções puras testadas com dados sintéticos.

```sh
pnpm check    # formatação, lint, tipos e testes
pnpm test     # só os testes
```

Os hooks do prek rodam formatação, lint e tipos a cada commit e os testes a cada push (`prek install --hook-type pre-commit --hook-type pre-push`). O GitHub Actions roda `pnpm check` e o build a cada push.

## Uso de IA

O projeto foi desenvolvido com o Claude Code, usando o modelo Claude Opus 5.5, da Anthropic.
