# Produtos de referência para o F.O.G.O.

Pesquisa feita em 22/10/2026 sobre centros de operações urbanas, plataformas de segurança pública, gestão de trânsito, telemetria de frota, painéis de cidade e gestão de manutenção. O foco é a interface: como cada produto organiza a tela, mostra situação, trata alertas e desenha o mapa.

A maior parte desses sistemas fica atrás de login. As descrições vêm de manuais e centrais de ajuda públicas, folhetos dos fabricantes, documentos de licitação e reportagens. Vi diretamente a página inicial do COR Rio e as telas atuais do F.O.G.O. (Central, Equipamentos e Cidade preditiva). O Dublin Dashboard estava fora do ar e o painel público do COP Recife não carregou. Afirmações de desempenho dos fabricantes estão marcadas como tal.

## As 10 lições mais úteis

1. A situação da cidade funciona quando é um número ou palavra curta com critério escrito. O COR Rio trocou os nomes antigos (normalidade, mobilização, atenção, alerta, crise) por estágios de 1 a 5 porque, segundo o próprio COR, a população não entendia os nomes nem sabia o que fazer em cada um. Cada estágio tem uma frase de critério. Na página inicial do COR aparecem dois indicadores lado a lado, "Estágio 1" e "Calor 1", ou seja, uma dimensão diferente ganha escala própria em vez de entrar na conta geral. O F.O.G.O. já tem três níveis com motivo em uma frase; falta mostrar desde quando a cidade está naquele nível e o critério de cada nível ao alcance de um clique.

2. Normal em cinza, cor só para desvio, e a forma carrega a informação junto com a cor. É a prática das telas de alto desempenho que seguem a ISA-101. O MyGeotab leva isso ao marcador: forma pelo tipo de ativo, cor pela situação e até dois sinais extras por marcador (falha, manutenção). O mapa de base também fica neutro: o Esri recomenda Light Gray ou Dark Gray Canvas para contraste, o Verizon Connect tem modo "low colour" e o ClearGuide oferece base em tons de cinza.

3. Dado velho é uma situação própria. O MyGeotab mostra "não comunica" com ícone específico e o tempo sem comunicação no hover. O Verizon Connect pisca em azul o cartão do veículo quando chega dado novo e mostra há quanto tempo ele está na situação atual. O simulador do F.O.G.O. gera quedas de comunicação; elas devem aparecer como "sem sinal há 3 h", distintas de "parado".

4. Lista e mapa compartilham filtros e seleção. Motive (Fleet View 2.0), Verizon Connect e ArcGIS Dashboards ligam as duas visões: passar o mouse num item da lista destaca o ponto no mapa, filtrar um filtra o outro, clicar num registro dá zoom. O Motive e o MyGeotab salvam a última posição, zoom e filtros.

5. Poucos alertas, ordenados por prioridade e com estado. O Esri recomenda no máximo duas notificações por painel. O Rekor Command vende a fila de incidentes ordenada por prioridade. O Samsara separa a caixa de alertas em "meus", "arquivados" e "todos", com tipo, ativo, hora e estado em cada linha. A Central do F.O.G.O. mostrava 63 alertas e 29 críticos sem reconhecimento na captura de hoje; nesse volume o vermelho deixa de distinguir alguma coisa.

6. Comparar com o normal daquele dia e horário. O Waze for Cities avisa sobre "trânsito incomum" contra o padrão do mesmo dia da semana e hora. O ClearGuide pinta as vias pelo percentual da velocidade de fluxo livre e tem um mapa de tendência por dia da semana e hora. Na Cidade preditiva, o índice por percentil faz com que dezenas de bairros apareçam como alto ou moderado ao mesmo tempo (35 bairros coloridos na captura de hoje). Mostrar "esperado agora contra o típico deste horário" e colorir só o que foge do normal segue a mesma regra de cor do resto do sistema.

7. Um evento no mapa responde "quem é afetado" e oferece a ação seguinte no mesmo lugar. No Motive, clicar no polígono de um evento climático mostra gravidade, início, fim e quantos motoristas e veículos estão dentro, com um botão para avisar todos. O Mark43 despacha a partir do mapa e recomenda unidades pelo tempo de rota. O MyGeotab tem "mais próximos" no clique do mapa. No F.O.G.O., clicar num bairro crítico deveria listar ocorrências abertas, equipamentos parados e os agentes livres mais próximos com tempo estimado.

8. Inventário começa pelo que está fora do normal. O Fleetio mostra no cabeçalho quantos veículos têm manutenção vencida e quantos vencem em breve, com abas por situação. O UpKeep abre a lista de ordens de serviço já filtrada em aberto, em andamento e em espera, com filtros na barra superior e visões salvas com nome. O Fiix tem painel de ativos fora de operação com data e responsável pela mudança.

9. Risco de falha precisa mostrar o porquê. O Maximo Health mostra a nota de saúde de cada ativo e o detalhamento de cada fator com o seu peso, uma matriz que cruza duas notas e filas de trabalho como "provável falha antes da preventiva". O F.O.G.O. já calcula o risco de falha em 7 dias; falta mostrar quanto da nota vem do tipo e quanto vem da manutenção vencida.

10. Quem olha poucas vezes por dia precisa de "o que mudou desde a última vez". As salas de controle resolvem isso com operador olhando o tempo todo; o gestor de Marília não está nessa situação. O CommandCentral Aware tem mapa histórico para rever um incidente como aconteceu, o kepler.gl tem linha do tempo com reprodução e o Motive restaura a última visão. Um resumo "desde as 9h" (ocorrências abertas e fechadas, equipamentos que pararam e voltaram, mudanças de nível) atende melhor esse usuário do que a lista ao vivo.

## Produtos

### Centro de Operações e Resiliência, Rio de Janeiro (COR)

Centro municipal com cerca de 50 órgãos, sala de situação com videowall de 125 telas e um Geoportal com mais de 150 camadas (trânsito, chuva, escolas, hospitais, ocorrências). Recebe e envia dados ao Waze desde 2013.

Vale copiar a escala de estágios com critério de uma frase por nível e a decisão de separar o calor em escala própria ("Calor 1" ao lado de "Estágio 1"). A mudança de nomes para números veio de entrevistas na rua; a lição para o F.O.G.O. é testar se "atenção" e "crítico" dizem ao gestor o que fazer. O mapa da sala dá zoom automático no entorno de cada nova ocorrência.

Vale evitar a escala de cinco cores do Cemaden (verde, amarelo, laranja, vermelho, roxo). Ela serve à comunicação pública; num sistema onde normal é cinza, três níveis bastam. O nível é decidido por pessoas no COR, e o F.O.G.O. calcula o seu por regra, então o critério precisa estar visível para o gestor confiar nele.

Fontes: https://cor.rio/centro-de-operacoes-rio-apresenta-os-novos-estagios-operacionais-da-cidade/, https://cor.rio/, https://cor.rio/expansao/, https://cor.rio/parcerias/, https://tecnoblog.net/especiais/centro-de-operacoes-rio/

### Detecta e Muralha Paulista (SSP-SP, CICC)

Sistema estadual que cruza leitura de placas, câmeras públicas e privadas e bases policiais e transforma o resultado em alertas. Segundo o TCE-SP, cada alerta aparece num painel com data, hora, ponto no mapa, relação com outros alertas e acesso às câmeras próximas. Hoje o programa se chama Muralha Paulista.

Vale copiar a ficha do alerta com "relacionados" e "o que há por perto". No F.O.G.O., um alerta de furto de totem pode listar os outros furtos no mesmo bairro na semana e as câmeras próximas e se elas estão funcionando.

Vale evitar o modelo de alerta para operador dedicado, com videowall. A interface é pensada para alto volume e atenção contínua.

Fontes: https://www.tce.sp.gov.br/sites/default/files/portal/detecta.pdf, http://www.sapp.org.br/sapp/wp-content/uploads/Sistema_Detecta_cartilha_completa_v3.pdf, https://www.metropoles.com/sao-paulo/exclusivo-o-pacote-que-tarcisio-planeja-contra-crise-da-seguranca

### Smart Sampa (São Paulo)

Central municipal de videomonitoramento inaugurada em 2024, com cerca de 400 profissionais, reconhecimento facial, alertas de vandalismo e placas, telemetria dos piscinões e do SAMU. Tem um painel público de LED (o "Prisômetro") com números do programa.

Vale copiar pouco da interface, que não é documentada. O painel público mostra que poucos números grandes e atualizados diariamente comunicam mais que muitos gráficos.

Vale evitar a dependência de câmeras e reconhecimento facial como eixo da tela; o F.O.G.O. é sobre equipamentos, agentes e ocorrências.

Fontes: https://prefeitura.sp.gov.br/web/seguranca_urbana/w/noticias/369060

### COP-BH (Belo Horizonte)

Centro Integrado de Operações criado para a Copa de 2014, com quase 5 mil câmeras e sala com BHTrans, Guarda Municipal, SAMU e Saúde. Tem uma sala separada para gestão de eventos, que ativa postos de comando.

Vale copiar a separação entre rotina e evento. No F.O.G.O., isso sugere um modo de evento (jogo, show, feriado) que muda o recorte do mapa e os limites de alerta por algumas horas.

Vale evitar tratar a sala integrada como modelo de tela para um gestor sozinho num notebook.

Fontes: https://prefeitura.pbh.gov.br/seguranca/copbh, https://prefeitura.pbh.gov.br/noticias/cop-bh-completa-10-anos-com-destaque-em-inovacao-excelencia-e-integracao, https://github.com/tarifazero/monitoramento

### CEIC Porto Alegre

Centro Integrado de Coordenação de Serviços, ligado à Secretaria de Segurança, com cerca de 3 mil câmeras, videowall de 39 telas e análise de vídeo que dispara alerta automático. A EPTC publica um mapa de câmeras.

Vale copiar a ideia de protocolo por tipo de ocorrência: cada tipo tem um caminho de resposta definido. No F.O.G.O., o alerta pode trazer o próximo passo recomendado ("acionar manutenção de semáforos", "enviar agente").

Vale evitar mapas públicos que mostram só localização sem situação.

Fontes: https://prefeitura.poa.br/smseg/ceic-poa, https://www.prefeitura.poa.br/smseg/noticias/porto-alegre-inova-com-monitoramento-por-analise-inteligente-de-video, https://prefeitura.poa.br/eptc/controle-e-monitoramento-da-mobilidade

### CCO de Curitiba (Urbs) e Muralha Digital

O Centro de Controle Operacional da Urbs monitora trânsito e transporte com mais de 700 câmeras, semáforos, sensores e painéis de mensagem variável que mudam com uma tecla. A Muralha Digital abriu um CCO próprio para segurança.

Vale copiar a ação direta sobre equipamentos a partir da central (mudar a mensagem de um painel). O F.O.G.O. tem painéis de mensagem no inventário; um botão "editar mensagem" na ficha do painel mostraria o equipamento como algo operável.

Vale evitar duas centrais separadas para trânsito e segurança, que é justamente o que o F.O.G.O. junta.

Fontes: https://www.curitiba.pr.gov.br/noticias/cameras-e-comunicacao-por-radio-agilizam-informacoes-sobre-o-transito-de-curitiba/34369, https://www.curitiba.pr.gov.br/noticias/centro-de-controle-operacional-da-muralha-digital-de-curitiba-comeca-a-funcionar/57562

### COP Recife

Centro de Operações com base integrada de dados espaciais em ArcGIS, 498 câmeras, drones e 13 órgãos. Tem painel público em cop.recife.pe.gov.br e montou sala de situação para o Carnaval com trânsito, temperatura e chuva em tempo real.

Vale copiar a montagem de painel por evento (Carnaval) e a combinação de clima com trânsito na mesma tela.

Vale evitar painéis montados em ArcGIS que empilham widgets sem hierarquia; não consegui abrir o painel público para confirmar como ele está hoje.

Fontes: https://blog.img.com.br/casos-de-sucesso/case-cop-recife-gestao-urbana-arcgis/, https://www2.recife.pe.gov.br/noticias/10/02/2024/cop-utiliza-estrutura-com-paineis-e-cameras-para-coordenacao-e-monitoramento-do

### Genetec Citigraf

Sistema de apoio à decisão para segurança pública que nasceu num projeto da polícia de Chicago. Junta despacho (CAD), câmeras, leitura de placas, detecção de disparos e registros num mapa com ícones por evento, além de painéis analíticos e mapas de calor para planejar patrulhas e efetivo. Os estados das entidades são configuráveis.

Vale copiar a ligação entre o ao vivo e o histórico no mesmo mapa (evento atual sobre o mapa de calor dos últimos dias), que o F.O.G.O. já oferece como camada opcional, e o uso do histórico para redesenhar efetivo, que é a função do reforço de agentes.

Vale evitar a dependência de vídeo e a densidade de ícones de uma sala de crime em tempo real.

Fontes: https://www.genetec.com/products/operations/citigraf/portfolio, https://www.omniapartners.com/suppliers-files/E-J/Genetec/Assets/2025.08_Citigraf_Real_Time_Crime_Center.pdf, https://www.securityinfowatch.com/video-surveillance/press-release/12374337/genetec-genetec-announces-citigraf-new-public-safety-decision-support-system

### Motorola CommandCentral Aware

Plataforma de consciência situacional sobre mapa Esri. Tem monitor de eventos em lista com filtros por tipo, abas por tipo de evento e colunas configuráveis; eventos podem ser fixados. Um motor de regras faz um alerta de pânico fixar e destacar o evento, dar zoom no local e abrir câmeras próximas. Tem mapa histórico para reproduzir um incidente e camadas por grupo de usuário.

Vale copiar o evento fixado (o gestor marca o que quer acompanhar e ele fica no topo), as regras que promovem um alerta e o mapa histórico. A reprodução das últimas horas atende o gestor que não estava olhando.

Vale evitar a interface modular arrastável em várias telas; para um notebook, layout fixo é melhor.

Fontes: https://www.motorolasolutions.com/en_us/blog/get-started-commandcentral-aware-101, https://www.motorolasolutions.com/en_us/products/command-center-software/public-safety-software/real-time-intelligence-operations/commandcentral-aware.html

### Hexagon (Octave OnCall Dispatch, antigo HxGN OnCall)

Sistema de despacho com recomendação de unidade, mapa com camadas operacionais e um módulo de painel que resume estados de eventos e unidades. As telas e formulários são configurados por cada órgão. Há fonte não oficial dizendo que o COR usa solução da Hexagon.

Vale copiar a recomendação de unidade explicada (por que esta equipe) e o painel-resumo de estados de unidades como cabeçalho.

Vale evitar a configurabilidade total: cada instalação acaba com cores diferentes para o mesmo estado.

Fontes: https://www.hexagonsafetyinfrastructure.com/products/computer-aided-dispatch, https://hxgn-oncall.com/fire-and-emergency-services/

### Mark43 CAD

Despacho em nuvem com mapa Esri, fila de eventos e fila de unidades. Arrastar uma unidade sobre um evento despacha; desde 2024 dá para criar evento e despachar soltando um alfinete no mapa. Recomenda unidades pelo tempo de rota. O menu de contexto da unidade só mostra as situações possíveis a partir da atual.

Vale copiar as transições válidas no menu (um equipamento "furtado" não vira "operacional" sem passar por "em manutenção", se essa for a regra) e a recomendação por tempo de rota, que o simulador do F.O.G.O. já calcula.

Vale evitar o arrastar e soltar como único caminho; é rápido para despachante e difícil de descobrir para quem usa pouco.

Fontes: https://mark43.com/wp-content/uploads/Mark43CAD.pdf, https://get.mark43.help/s/article/Using-the-Unit-Queue-Right-Click-Menu, https://get.mark43.help/hc/s/article/CAD-Features-Fall-2024

### Flock Safety (FlockOS)

Plataforma de leitura de placas e sala de crime em tempo real sobre mapa Esri, com camadas de câmeras, limites de distrito, alertas de despacho, viaturas e drones. O aplicativo móvel tem "modo turno", que só entrega alertas durante o serviço, e notificações por raio.

Vale copiar o modo turno e o raio: alertas filtrados pelo contexto de quem recebe. Para o gestor, isso se traduz em escolher quais tipos de alerta merecem notificação.

Vale evitar o volume de camadas e a lógica de vigilância de placas, fora do escopo.

Fontes: https://www.flocksafety.com/products/flock-os, https://www.avonindiana.gov/AgendaCenter/ViewFile/Item/2071?fileID=2448

### Axon Fusus

Sala de crime em tempo real na nuvem, com um mapa único que junta posição de agentes, alertas, despacho, leitura de placas e vídeo. Incidentes do despacho abrem direto no mapa com os recursos ao redor. Tem aplicativo nativo para campo.

Vale copiar a abertura do incidente com o entorno já carregado (câmeras, agentes, equipamentos num raio).

Vale evitar o foco em vídeo e a promessa de "tudo num mapa", que leva a mapas saturados.

Fontes: https://www.axon.com/products/axon-fusus, https://www.axon.com/products/axon-fusus/unified-interface

### Esri ArcGIS Dashboards

Ferramenta de painéis usada por muitas prefeituras, inclusive o COP Recife. A documentação oficial tem boas regras: um painel por público, só a informação necessária, valores de referência nos indicadores, no máximo duas notificações, formatação condicional que muda a cor ao cruzar um limite, elementos mais importantes maiores e no canto superior esquerdo, mapa ao centro com indicadores à direita, mapa de base cinza para contraste, títulos visíveis em todo elemento. Separa painéis de retrato e de monitoramento.

Vale copiar quase tudo isso como lista de verificação. O layout "mapa ao centro, indicadores à direita" é o que o F.O.G.O. já adotou.

Vale evitar o resultado típico de painéis montados por usuário: excesso de rosca, gauge e cor.

Fontes: https://doc.arcgis.com/en/dashboards/latest/reference/author-effective-dashboards.htm, https://doc.arcgis.com/en/dashboards/latest/reference/accessibility-best-practices.htm, https://www.nysgis.net/Docs/NYGeoCon2019/Ops-Dashboard-Design-Strategies-and-Tips-NYSGIS-Sept-24-2019.pdf

### Waze for Cities

Programa gratuito para órgãos públicos. O Traffic View tem o "Waze-o-meter" (indicador de congestionamento por cor), um feed de trânsito incomum que compara com o histórico do mesmo dia e hora e uma lista de rotas acompanhadas com tempo de viagem. Os órgãos também publicam interdições no Waze.

Vale copiar o alerta por desvio do padrão e a lista de pontos acompanhados. O gestor pode marcar bairros ou equipamentos como "acompanhar" e ver só eles no resumo.

Vale evitar o medidor genérico de congestionamento sem referência ao normal.

Fontes: https://support.google.com/waze/partners/answer/10618047?hl=en, https://www.nationalacademies.org/read/28690/chapter/11, https://www.waze.com/wazeforcities/

### Iteris ClearGuide (e INRIX, na mesma categoria)

Plataforma de análise de trânsito por dados de sondas. A camada principal é o percentual da velocidade de fluxo livre, com legenda recolhível no canto inferior esquerdo e camadas no canto superior direito. O mapa de tendência mostra congestionamento por dia da semana e hora ao longo do mês. Alertas de rota disparam por atraso excessivo, velocidade baixa ou congestionamento acima da média. Um índice de confiabilidade separa trechos em rápido e confiável, rápido e instável, lento e confiável, lento e instável. A INRIX oferece produtos parecidos; não encontrei documentação pública de interface dela.

Vale copiar a medida relativa ao normal, a matriz dia da semana por hora e a classificação em quatro quadrantes, que serve ao risco por bairro (alto e estável contra alto e subindo).

Vale evitar a escala contínua de verde a vermelho em todas as vias.

Fontes: https://www.iteris.com/blog/iteris-adds-trend-maps-route-alerts-and-incident-data-clearguide, https://clearguide-docs.s3.amazonaws.com/ClearGuide_User_Manual.pdf, https://www.iteris.com/oursolutions/traffic-analytics-software/clearguide

### Yunex Traffic (Sitraffic/Yutraffic Concert)

Central de trânsito em que o mapa vetorial da cidade é a entrada principal. Cada objeto aparece com dados fixos e dinâmicos, em camadas que se ligam e desligam. A central envia mensagens de falha por e-mail ou SMS ao responsável local.

Vale copiar o envio da falha direto para o órgão responsável. O F.O.G.O. guarda o órgão de cada equipamento; a ficha de falha pode dizer "avisar Mobilidade Urbana".

Vale evitar a tela de engenharia de semáforos, que não é para gestor.

Fontes: https://www.yunextraffic.com/wp-content/uploads/2023/05/Yunex-Traffic_Yutraffic-Centrals_EN.pdf, https://www.westernsystems-inc.com/product/concert-tm/

### Kapsch EcoTrafiX

Plataforma de gestão de mobilidade com operação centrada no mapa e lista de eventos. Associa a cada incidente um plano de resposta e os recursos (câmeras, painéis, viaturas). A visão comum pode ser recortada por operador e área de responsabilidade. A versão de 2026 cria incidentes automaticamente e os gerencia num gestor de eventos.

Vale copiar o plano de resposta ligado ao incidente e o recorte por área de responsabilidade (por região, no F.O.G.O.).

Vale evitar a criação automática de muitos incidentes sem agrupamento.

Fontes: https://www.kapsch.net/_Resources/Persistent/8aa7fe0b125f0c4085f776b3ea61f4e7027cc4c2/Kapsch_EcoTrafiX-Suite_Datasheet_EN.pdf, https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Publications/Research/Transportation/18-22-EcoTrafiX.pdf

### Rekor Command (antiga Waycare)

Plataforma para centros de gestão de trânsito que aprende o padrão normal das vias e marca anomalias como incidentes. Os alertas chegam ordenados por prioridade; o operador confirma, e a confirmação volta para o modelo. O fabricante afirma detecção 9 minutos mais rápida.

Vale copiar o ciclo confirmar ou descartar uma anomalia. As anomalias do F.O.G.O. (sensor zerado, pico de fluxo, concentração de ocorrências) ganhariam um "confirmar" e "falso alarme", e a taxa de falsos alarmes aparece na qualidade do modelo.

Vale evitar números de desempenho sem fonte na própria tela.

Fontes: https://www.rekor.ai/software/command, https://www.texashighwayproducts.com/blog/rekor-command-and-the-shift-toward-real-time-roadway-intelligence

### Samsara

Telemetria de frota com mapa ao vivo, camadas de trânsito e clima e uma caixa de alertas no aplicativo. Cada linha traz tipo, veículo ou motorista, hora e estado do alerta, com abas "meus", "arquivados" e "todos" e ações de arquivar e marcar como lido. Gestores só veem alertas para os quais foram cadastrados.

Vale copiar a caixa de alertas como uma caixa de entrada: lido, não lido, arquivado, com o reconhecimento separado do arquivamento.

Vale evitar entregar todos os alertas a todos; o F.O.G.O. pode ter uma regra simples do que vai para o gestor.

Fontes: https://kb.samsara.com/hc/en-us/articles/4408735637005-View-Alerts-in-the-Samsara-Fleet-App, https://www.samsara.com/products/telematics/gps-fleet-tracking

### Motive

Telemetria de frota. O Fleet View 2.0 (maio de 2026) trouxe agrupamento em áreas densas, mapa e lista sincronizados, última posição e zoom restaurados, cartões configuráveis e eventos climáticos como polígonos. Clicar num polígono mostra resumo, gravidade, início e fim e quantos motoristas e veículos estão dentro, com um botão para enviar aviso só a eles. No aplicativo, ícones compactos mostram o tipo e a situação (em movimento, parado, ocioso, desatualizado).

Vale copiar o polígono com contagem de afetados e ação de um clique, e a situação "desatualizado" no ícone.

Vale evitar o resumo gerado por IA sem indicação de fonte.

Fontes: https://helpcenter.gomotive.com/hc/en-us/articles/36088175670685-Fleet-View-2-0, https://apps.apple.com/us/app/motive-fleet/id1531641455

### Geotab (MyGeotab)

Telemetria de frota com o mapa mais bem documentado da pesquisa. Os novos marcadores usam forma por tipo de ativo, cor por situação e até dois sinais extras (falha grave, manutenção), com paleta segura para daltônicos. Marcadores viram pontos ou alfinetes conforme o espaço na tela, não por zoom fixo. "Não comunica" tem ícone próprio e mostra há quanto tempo. Com mais de 50 ativos, o mapa fica vazio até o usuário escolher ativos ou aproximar numa área com até 500. Visões salvas guardam área, zoom, filtros, ordenação e camadas. Em 2026 trocou "Exceptions" por "Events" em toda a interface.

Vale copiar o sistema de marcador (forma, cor, dois sinais), a troca de ponto para alfinete por espaço e o estado de comunicação. A troca de nome também ensina: o termo da tela deve ser o que o usuário fala.

Vale evitar o mapa vazio acima de um limite; para 282 equipamentos o agrupamento resolve.

Fontes: https://support.geotab.com/help/mygeotab/fleet-activity/map/the-map, https://support.geotab.com/product-updates/release-notes/whats-new-july-2026, https://support.geotab.com/mygeotab/doc/release-notes

### Verizon Connect Reveal

Telemetria de frota que abre no mapa ao vivo, com lista de cartões à esquerda. O cartão pisca em azul quando o veículo se comunica e mostra hora da última atualização. Passar o mouse num cartão destaca o veículo no mapa com um círculo. O balão do mapa mostra há quanto tempo o veículo está na situação atual. Erros de dispositivo aparecem como um sub-ícone sobre o marcador. Agrupamento com número, legenda de ícones em "Opções do mapa" e modo de pouca cor.

Vale copiar o tempo na situação atual ("parado há 3 dias"), o destaque cruzado entre cartão e mapa, o sub-ícone de erro e o sinal visual de dado novo.

Vale evitar o semáforo verde, amarelo e vermelho para situações normais: veículo desligado aparece em vermelho, o que contradiz a regra de cor só para problema.

Fontes: https://reveal-help.verizonconnect.com/hc/en-us/articles/360010567839-Fleet-Status-list, https://reveal-help.verizonconnect.com/hc/en-us/articles/360010567759-Using-Live-Map, https://www.expertmarket.com/fleet-management/verizon-connect-fleet-review

### Fleetio

Gestão de manutenção de frota. A lista de lembretes de serviço tem no cabeçalho o total de veículos vencidos, a vencer e adiados e a conformidade média, com abas por situação e agrupamento por veículo, além de resolver ou adiar em lote. Problemas viram "vencidos" quando passam de um limite de data ou quilometragem. Há um e-mail semanal com o que vence.

Vale copiar o cabeçalho com vencido e a vencer, as ações em lote e o resumo semanal.

Vale evitar o número de abas e configurações de uma ferramenta de oficina.

Fontes: https://help.fleetio.com/en_US/maintenance/issues-overview, https://help.fleetio.com/en_US/service-reminders-schedules/service-reminders-grouped-by-vehicle, https://help.fleetio.com/asset-management/fleet-map-overview

### kepler.gl

Ferramenta aberta de visualização geoespacial da Uber. Camadas de pontos, hexágonos, mapa de calor e trajetos; filtros por qualquer campo, inclusive histograma para excluir valores extremos; um filtro de tempo abre uma linha do tempo no rodapé com a contagem de pontos em cada instante, janela ajustável e reprodução.

Vale copiar a linha do tempo com histograma para rever as últimas 24 horas na Central e o histograma dentro do filtro.

Vale evitar 3D, arcos e misturas de cor, que servem à exploração e atrapalham a leitura rápida.

Fontes: https://docs.kepler.gl/docs/user-guides, https://www.uber.com/us/en/blog/keplergl/

### Dublin Dashboard

Painel aberto da cidade de Dublin feito com a Universidade de Maynooth, com dados em tempo real, séries de indicadores e mapas interativos de várias fontes. Estava fora do ar quando tentei abrir.

Vale copiar a separação entre ao vivo e indicadores de longo prazo e a publicação dos dados por trás de cada gráfico.

Vale evitar o portal de dezenas de módulos sem pergunta central.

Fontes: https://isprs-annals.copernicus.org/articles/IV-4-W1/19/2016/isprs-annals-IV-4-W1-19-2016.pdf, https://progcity.maynoothuniversity.ie/dublin-dashboard/

### London Datastore e CityDashboard

O Datastore é o portal de dados abertos de Londres. O CityDashboard, da UCL, junta dados espaciais simples num painel e num mapa. O artigo do Dublin Dashboard observa que painéis como o de Londres tendem a acompanhar metas e não a situação ao vivo.

Vale copiar a distinção entre painel de metas e painel de situação. A Cidade preditiva do F.O.G.O. é o lugar das tendências; a Central é o lugar do agora.

Vale evitar misturar os dois na mesma tela.

Fontes: https://data.london.gov.uk/, https://link.springer.com/article/10.1186/s42162-020-00108-6

### Barcelona Sentilo

Plataforma aberta de sensores da prefeitura de Barcelona, com API para dados, ordens e alarmes e um painel web. Foi adotada por outras cidades.

Vale copiar o modelo de dados com alarmes como objetos de primeira classe e a separação entre sensor, leitura e alarme, que corresponde à telemetria do F.O.G.O.

Vale evitar o painel técnico de sensores como tela de gestor.

Fontes: https://sdglocalaction.org/sentilo-iot/

### IBM Maximo (Manage e Health)

Gestão de ativos corporativa. O Maximo Health abre numa tabela de ativos com notas de saúde, criticidade e risco; tem visão em mapa com pinos coloridos e uma matriz que conta ativos por faixa de duas notas. O detalhamento mostra cada fator e seu peso. Filas de trabalho listam ativos com provável falha antes da preventiva e ativos com dados faltando. Do mapa se cria ordem de serviço.

Vale copiar o detalhamento da nota, a matriz de risco e a fila "dados faltando" (equipamentos sem data de instalação ou sem coordenada).

Vale evitar a densidade de campos e a navegação por módulos do Maximo Manage.

Fontes: https://tinnokesh.com/2026/05/11/mas-maximo-health-features/, https://ibm.github.io/maximo-labs/apm_9.0/demo_script/, https://www.ibm.com/docs/en/masv-and-l/cd?topic=applications-maximo-health

### UpKeep

Gestão de manutenção. A lista de ordens abre filtrada em aberto, em andamento e em espera. A barra de filtros tem situação, prioridade, local, ativo e responsável, com um botão para mais filtros e visões salvas com nome. Na ficha do ativo, as ordens dele aparecem sem trocar de página. Prioridade tem quatro níveis, de nenhuma a alta.

Vale copiar o filtro padrão que esconde o resolvido, a barra com poucos filtros e "mais filtros", as visões salvas e as ordens dentro da ficha do equipamento.

Vale evitar quatro níveis de prioridade quando três bastam.

Fontes: https://help.onupkeep.com/en/articles/9597064-how-to-filter-your-work-orders-beta, https://help.onupkeep.com/en/articles/9265518-how-to-filter-work-orders-in-the-assets-section

### Fiix

Gestão de manutenção da Rockwell. Biblioteca de painéis prontos: ordens ativas por prioridade, os 25 ativos com mais ordens abertas, os 5 com mais ordens vencidas, ativos fora de operação com data e responsável pela mudança. Organiza ativos em hierarquia (região, local, instalação, equipamento).

Vale copiar o "top N com mais problemas" e o registro de quem mudou a situação e quando.

Vale evitar gráficos de pizza por prioridade.

Fontes: https://helpdesk.fiixsoftware.com/hc/en-us/articles/11605028180116-Active-work-orders-dashboard, https://helpdesk.fiixsoftware.com/hc/en-us/articles/16532330050452-Work-order-planning-dashboard, https://helpdesk.fiixsoftware.com/hc/en-us/articles/4412178912916-List-of-dashboard-widgets-and-filters

### Telas de alto desempenho (ISA-101)

Não é um produto, mas é a referência que o F.O.G.O. já segue. A norma não define cores; ela define um processo. A prática associada usa fundo e elementos normais em cinza, uma paleta pequena e exclusiva para prioridades de alarme e forma ou número junto com a cor (por exemplo, triângulo com "2" para prioridade 2).

Vale copiar a regra de que a cor de alarme não aparece em nada que não seja alarme, incluindo gráficos e botões, e a prioridade com forma e número.

Vale evitar paletas com magenta e ciano para estados extras sem necessidade.

Fontes: https://aevus.io/learn/isa-101/, https://www.atlas-ot.com/blogs/post/human-machine-interface-standards-isa-101-and-high-performance-hmi1, https://hmilibrary.com/standards/isa-101

## Aplicação no F.O.G.O.

As propostas abaixo partem das decisões já tomadas (mapa como base da Central, um painel lateral com abas, três níveis de situação, bairro em atenção só com contorno tracejado, listas com barra de filtros e tabela, Cidade preditiva em abas, identidade de sinalização). Observações sobre a tela atual vêm das capturas de 22/10/2026.

### Central de operações

Mostrar o nível da cidade com o critério e a duração: "Crítico desde 14h20. Zona Oeste crítica." Um clique abre os três níveis com a regra de cada um, como os estágios do COR. Se o calor ou a chuva entrarem um dia, ganham indicador próprio ao lado, sem mudar o nível geral.

Acrescentar um bloco "Desde a sua última visita" no topo do painel: ocorrências abertas e fechadas, equipamentos que pararam e voltaram e mudanças de nível das regiões, com hora. A visita pode ser guardada no navegador. Isso vem da reprodução do CommandCentral e da última visão do Motive, adaptado ao gestor que abre o sistema poucas vezes por dia.

Reduzir os alertas que chegam ao gestor. Agrupar por bairro e por tipo ("4 equipamentos parados no Centro" em vez de quatro cartões), separar o que pede ação (ocorrência crítica sem equipe, furto) do informativo, e tratar a aba como caixa de entrada com não lidos, reconhecidos e arquivados, como no Samsara. Esri sugere no máximo duas notificações ativas; 29 críticos sem reconhecimento não cabem nessa regra.

Corrigir o preenchimento dos bairros em atenção: na captura de hoje eles ainda aparecem com fundo amarelado, e a decisão é só contorno tracejado. Com o mapa quase todo preenchido, o zebrado do bairro crítico perde contraste.

Adotar o sistema de marcador do MyGeotab: forma pela situação (já existe), um sinal extra no canto para manutenção vencida e outro para "sem comunicação", com o tempo ("sem sinal há 3 h") no hover. O selo vermelho dos grupos deveria contar só os parados, como hoje, e ficar ausente quando o grupo está todo normal.

Ao clicar num bairro crítico, abrir no painel o que há dentro dele: ocorrências abertas, equipamentos parados, agentes mais próximos com tempo estimado de chegada e o próximo passo sugerido. É o polígono com afetados do Motive e o incidente com entorno do Fusus.

Na ficha de um equipamento, mostrar "parado há 3 dias", o órgão responsável com a ação "avisar" (Yunex), as transições de situação permitidas (Mark43) e quem mudou a situação por último (Fiix). Painéis de mensagem podem ter a mensagem atual visível.

Oferecer uma linha do tempo das últimas 24 horas no rodapé do mapa, com histograma de ocorrências por hora, como a do kepler.gl. Ela substitui parte do mapa de calor de 30 dias, que pode continuar como camada.

Considerar um mapa de base claro como opção. O Esri recomenda Light Gray ou Dark Gray; o tema escuro faz sentido em sala escura, e o gestor no notebook durante o dia pode preferir o claro. A identidade de sinalização funciona nos dois.

### Equipamentos

Manter os cartões de resumo por tipo, mas mostrar número só onde há problema e em cinza o total; o cabeçalho do Fleetio com vencidas e a vencer serve de modelo para manutenção. Os cartões já filtram a lista; o filtro ativo precisa aparecer como etiqueta removível na barra.

Abrir a tabela já ordenada por gravidade (furtado, mau funcionamento, manutenção imediata, sem comunicação, resto), com a opção "só com problema" ligada por padrão, como o UpKeep faz com ordens abertas.

Colunas novas ou ajustadas: "situação desde" (parado há X dias), "última comunicação" com tempo relativo só em destaque quando passa do limite, e manutenção como "vencida há 12 dias" ou "em 5 dias" em vez de data crua.

Visões salvas com nome ("Câmeras paradas na Zona Norte", "Manutenção vencendo esta semana") e ações em lote (agendar manutenção, mudar órgão), como UpKeep e Fleetio.

Uma fila de "dados faltando" (sem coordenada, sem data de instalação, sem próxima manutenção), inspirada no Maximo Health.

### Agentes

Mesma estrutura da lista de equipamentos, com situação em cinza para disponível e cor só para quem está há muito tempo numa ocorrência, sem comunicação ou fora da base no turno errado.

Mostrar o tempo na situação atual ("em atendimento há 47 min") e a ocorrência ligada, como o balão do Verizon Connect. Passar o mouse numa linha destaca o agente no mapa da Central quando as duas telas estiverem lado a lado, ou abre uma miniatura de mapa na ficha.

Agrupar por região e turno com o saldo da região vindo da Cidade preditiva ("Zona Oeste: 6 em serviço, previsão pede 8"). Isso liga a lista ao reforço de agentes.

### Formulários

Manter o catálogo único que gera formulário e validação. Na ficha de cadastro, mostrar só os campos do tipo escolhido e agrupar em blocos curtos (identificação, local, manutenção, características). O mapa para ajustar o ponto já existe.

Transições de situação como ação na ficha, não como campo livre no formulário de edição, com registro de quem e quando (Mark43, Fiix).

Valores padrão a partir do tipo (periodicidade de manutenção de cada tipo) e da última entrada do usuário (órgão), para reduzir digitação.

### Cidade preditiva

Separar as abas por pergunta, como já decidido: "Onde vai acontecer", "Onde falta gente", "O que está estranho", "O que vai quebrar", "Para onde vai a tendência", "Quanto confiar".

No risco por bairro, trocar o destaque por percentil pelo desvio do normal daquele horário, como o Waze e o ClearGuide. Hoje 2 bairros aparecem como críticos, 7 como altos e 26 como moderados; com cor em 35 bairros a regra de cor só para problema se perde. Proposta: cinza para dentro do esperado, tracejado para acima do esperado e zebrado só para os poucos muito acima, com o número esperado de ocorrências no lugar do índice de 0 a 100.

Classificar bairros em quadrantes como o índice de confiabilidade do ClearGuide: risco alto e estável, risco alto e subindo, risco baixo e subindo, resto. "Subindo" é o que o gestor ainda pode mudar.

Mostrar a matriz dia da semana por hora (já existe) com o horário atual marcado e a coluna de hoje em destaque.

Nas anomalias, acrescentar "confirmar" e "falso alarme" e mostrar a taxa de falso alarme na aba de qualidade, como no ciclo do Rekor.

No risco de falha, mostrar o detalhamento da nota (quanto vem do tipo, quanto da manutenção vencida) e uma matriz pequena de probabilidade de falha por importância do equipamento, como no Maximo Health, com a fila de manutenção preventiva ao lado.

Trocar o estado de carregamento "Calculando..." repetido por um esqueleto de cada bloco com o título já visível, e dizer quanto tempo levou o cálculo e com dados até que hora.

### Navegação

Manter as quatro áreas no topo. Um indicador pequeno ao lado de "Central de operações" com o nível da cidade e, ao lado de "Equipamentos", o número de parados, para que o gestor veja a situação de qualquer página.

Guardar a última visão de cada página (posição do mapa, filtros, aba aberta) e restaurar ao voltar, como Motive e MyGeotab.

Usar os termos do usuário em toda a interface. O MyGeotab trocou "Exceptions" por "Events" pelo mesmo motivo que o COR trocou os nomes dos estágios. Vale revisar "Previsões" na barra contra "Cidade preditiva" no título da página.

Em celular, priorizar a leitura: nível da cidade, resumo "desde a última visita" e caixa de alertas, com o mapa um toque abaixo. Flock e Samsara tratam o celular como recebedor de alertas, não como sala de controle.
