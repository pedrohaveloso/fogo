# Simulação e produção

O FOGO roda em dois modos. O modo simulação serve para apresentar o sistema: gera inventário, agentes e 120 dias de histórico, e o simulador faz o papel dos dispositivos, com ocorrências e falhas 20 vezes mais rápidas que na vida real. O modo produção começa com o banco vazio. Tudo precisa ser cadastrado, e o que acontece na rua só aparece no painel quando alguém registra ou um dispositivo informa.

## Como rodar

| Comando                                          | Modo                              | Banco             |
| ------------------------------------------------ | --------------------------------- | ----------------- |
| `docker compose up --build`                      | simulação                         | `fogo_simulation` |
| `FOGO_MODE=production docker compose up --build` | produção                          | `fogo_production` |
| `pnpm dev`                                       | simulação                         | `fogo_simulation` |
| `pnpm dev:production`                            | produção                          | `fogo_production` |
| `pnpm build && pnpm start`                       | produção                          | `fogo_production` |
| `pnpm start:simulation`                          | simulação                         | `fogo_simulation` |
| `pnpm start:fresh`                               | simulação, apagando o banco antes | `fogo_simulation` |

Os comandos `pnpm` precisam de um PostgreSQL. O jeito mais simples é `docker compose up -d db`, que sobe o banco na porta 5432 com os dois bancos criados. Para usar outro servidor, aponte `DATABASE_URL` para ele.

O modo vem da variável `FOGO_MODE` (`simulation` ou `production`). Sem ela, o servidor sobe em produção, porque um engano nesse sentido nunca coloca dados inventados num banco real. A opção `--simulation` da linha de comando tem prioridade sobre a variável. No Compose, o padrão é a simulação.

O banco guarda o modo em que foi criado, e o servidor se recusa a abrir um banco de simulação em produção ou o contrário. O `--reset` só funciona na simulação e apaga todas as tabelas antes de subir.

Na produção, o fator de aceleração é sempre 1 e `FOGO_LIVE_MULTIPLIER` é ignorado. Cidades sem simulador, inclusive as cadastradas durante a simulação, recebem a situação recalculada a cada 5 segundos, para que alertas que dependem do tempo, como "sem comunicação" e manutenção vencida, apareçam sem ninguém mexer em nada. A interface mostra a marca "Simulação" no topo só na cidade simulada.

## Primeiro acesso em produção

O banco de produção começa vazio. Na primeira subida, o servidor cria o usuário `root`, com a senha de `FOGO_ROOT_PASSWORD` ou, sem ela, `root`. A ordem de trabalho é esta:

1. Entrar como `root` e trocar a senha em Minha senha.
2. Em Cidades, cadastrar a cidade: UF, município da lista do IBGE e limite, que vem do OpenStreetMap e pode ser redesenhado.
3. Em Bairros, cadastrar as zonas pelo botão Zonas e depois desenhar os bairros.
4. Em Órgãos, cadastrar os órgãos responsáveis pelos equipamentos e agentes.
5. Cadastrar equipamentos e agentes, e criar as tags dos que mandam posição.
6. Em Usuários, cadastrar quem vai usar o sistema, com o perfil e as cidades de cada um.

## O que já funciona em produção

- Login com sessão em cookie `HttpOnly`, senha guardada com scrypt e dois perfis: administrador (cidades, usuários e todo o resto) e usuário (só as cidades atribuídas, sem cadastro de cidades nem de usuários). A rota `/api/health` e a de localização das tags ficam fora do login.
- Várias cidades no mesmo servidor, com zonas, bairros e órgãos próprios.
- Cadastro de equipamentos, agentes, bairros, zonas e órgãos pela interface e pela API.
- Posição de equipamentos e agentes enviada por rastreador (`POST /api/tags/{id}/location`, descrita em [trackers.md](trackers.md)). A mesma chamada atualiza o último sinal e a bateria.
- Registro de ocorrência pela API (`POST /api/occurrences`) e encerramento pela ficha da ocorrência na Central.
- Mudança de situação de um equipamento pelo formulário, que grava o histórico de situações.
- Reconhecimento de alertas.
- Previsões e alertas calculados só a partir do banco. Com o banco vazio, as telas abrem sem erro e mostram tudo zerado.

## O que falta para a operação real

O simulador faz hoje quatro coisas que ninguém faz em produção: cria ocorrências, despacha agentes, muda a situação dos agentes e gera a telemetria dos equipamentos fixos. Cada fase abaixo cobre uma parte, na ordem em que vale atacar.

### Fase 1: acesso e implantação

O login e os perfis já existem. Falta o resto da implantação:

- Registro de quem fez cada mudança (`audit_log` com usuário, ação, alvo e horário).
- Limite de requisições por tag nas rotas de dispositivo.
- Guia de implantação: HTTPS num proxy reverso (Caddy ou Nginx), que precisa repassar `X-Forwarded-Proto` para o cookie de sessão sair com `Secure`, backup diário do PostgreSQL com `pg_dump` e o que monitorar.

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
