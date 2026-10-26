# Simulação e produção

O FOGO roda em dois modos. O modo simulação serve para apresentar o sistema: gera inventário, agentes e 120 dias de histórico, e o simulador faz o papel dos dispositivos, com ocorrências e falhas 20 vezes mais rápidas que na vida real. O modo produção começa com o banco vazio. Tudo precisa ser cadastrado, e o que acontece na rua só aparece no painel quando alguém registra ou um dispositivo informa.

## Como rodar

| Comando                    | Modo                              | Banco padrão              |
| -------------------------- | --------------------------------- | ------------------------- |
| `pnpm dev`                 | simulação                         | `data/fogo.db`            |
| `pnpm dev:production`      | produção                          | `data/fogo-production.db` |
| `pnpm demo`                | simulação                         | `data/fogo.db`            |
| `pnpm build && pnpm start` | produção                          | `data/fogo-production.db` |
| `pnpm start:simulation`    | simulação                         | `data/fogo.db`            |
| `pnpm start:fresh`         | simulação, apagando o banco antes | `data/fogo.db`            |

O modo vem da variável `FOGO_MODE` (`simulation` ou `production`). Sem ela, o servidor sobe em produção, porque um engano nesse sentido nunca coloca dados inventados num banco real. A opção `--simulation` da linha de comando tem prioridade sobre a variável.

O banco guarda o modo em que foi criado, e o servidor se recusa a abrir um banco de simulação em produção ou o contrário. O `--reset` só funciona na simulação.

Com Docker, `docker compose up --build` sobe a simulação e `FOGO_MODE=production docker compose up --build` sobe a produção. Cada modo usa um arquivo próprio no volume (`fogo-simulation.db` e `fogo-production.db`). A imagem, rodada direto com `docker run`, começa em produção.

Na produção, o fator de aceleração é sempre 1 e `FOGO_LIVE_MULTIPLIER` é ignorado. Sem o simulador, o servidor recalcula a situação da cidade a cada 5 segundos e manda para o painel, para que alertas que dependem do tempo, como "sem comunicação" e manutenção vencida, apareçam sem ninguém mexer em nada. A interface mostra a marca "Simulação" no topo só no modo simulação.

## O que já funciona em produção

- Cadastro de equipamentos, agentes e bairros pela interface e pela API.
- Posição de equipamentos e agentes enviada por rastreador (`POST /api/tags/{id}/location`, descrita em [trackers.md](trackers.md)). A mesma chamada atualiza o último sinal e a bateria.
- Registro de ocorrência pela API (`POST /api/occurrences`) e encerramento pela ficha da ocorrência na Central.
- Mudança de situação de um equipamento pelo formulário, que grava o histórico de situações.
- Reconhecimento de alertas.
- Previsões e alertas calculados só a partir do banco. Com o banco vazio, as telas abrem sem erro e mostram tudo zerado.

## O que falta para a operação real

O simulador faz hoje quatro coisas que ninguém faz em produção: cria ocorrências, despacha agentes, muda a situação dos agentes e gera a telemetria dos equipamentos fixos. Cada fase abaixo cobre uma parte, na ordem em que vale atacar.

### Fase 1: acesso e implantação

Sem login, qualquer pessoa na rede pode alterar o inventário. Isso impede a produção antes de qualquer outra coisa.

- Login com sessão em cookie `HttpOnly`, senha guardada com scrypt do próprio Node e tabela `users` com três perfis: gestor (tudo), operador (ocorrências, despacho e alertas) e consulta (só leitura).
- Middleware no Hono que exige sessão em toda rota `/api`, menos `/api/health` e as rotas de dispositivo, que continuam usando o token da tag.
- Registro de quem fez cada mudança (`audit_log` com usuário, ação, alvo e horário).
- Limite de requisições por tag nas rotas de dispositivo.
- Guia de implantação: HTTPS num proxy reverso (Caddy ou Nginx), backup diário do SQLite com `VACUUM INTO` ou Litestream, e o que monitorar.

### Fase 2: ocorrências e despacho

- Tela de registro de ocorrência na Central, com tipo, gravidade, local por endereço ou clique no mapa e descrição. A rota já existe.
- `POST /api/occurrences/{id}/dispatch` com o agente escolhido. O servidor sugere os que chegam antes, com a mesma estimativa que o simulador usa hoje (distância em linha reta dividida pela velocidade de cada tipo de agente).
- `POST /api/occurrences/{id}/status` para "a caminho", "no local" e "encerrada", vindo do operador ou do celular do agente.
- Webhook de entrada (`POST /api/integrations/occurrences`, com token por sistema) para receber chamados de outros sistemas da prefeitura, como a central do 153 ou o atendimento ao cidadão (156).

### Fase 3: agentes em campo

- Um app simples para o agente, que pode ser uma página web instalável (PWA) servida pelo próprio FOGO. O app manda a posição pela rota da tag que já existe e a situação por `POST /api/tags/{id}/status` (disponível, em pausa, fora de serviço).
- O despacho da fase 2 aparece no app, e o agente confirma "a caminho" e "no local".
- Sem app, o operador muda a situação do agente pela Central.

### Fase 4: telemetria dos equipamentos

- `POST /api/tags/{id}/heartbeat` para equipamentos fixos (câmeras, radares, semáforos) avisarem que estão vivos, com bateria e situação opcional ("mau funcionamento" vira evento no histórico).
- `POST /api/tags/{id}/readings` com contagens por hora (veículos, passagens, leituras de placa). Os modelos de comportamento fora do padrão leem a tabela `readings`, que hoje só o simulador preenche.
- Registro de manutenção feita pela ficha do equipamento, gravando em `maintenance_events`, que o modelo de risco de falha usa.
- Para fabricantes que não falam HTTP, um adaptador por fabricante que lê o sistema deles (por exemplo, o estado das câmeras num VMS via ONVIF ou o controlador central dos semáforos) e chama as rotas acima.

### Fase 5: previsões com dados reais

- Importação de histórico (`pnpm import:occurrences arquivo.csv`) para os modelos não começarem do zero. As previsões precisam de algumas semanas de dados para sair do valor de base.
- Aviso na Cidade preditiva quando o histórico for curto demais para confiar nos números.
- Medir de novo os limiares de alerta e de anomalia com os dados reais, usando o backtest que já existe em `/api/predictions/backtest`.

## Critério de pronto

A produção está pronta quando um dia inteiro de operação funciona sem o simulador: o operador entra com login, registra ou recebe uma ocorrência, despacha um agente, o agente informa a chegada pelo celular, a ocorrência é encerrada, um equipamento que para de mandar sinal gera o alerta, e tudo fica registrado com o autor de cada ação.
