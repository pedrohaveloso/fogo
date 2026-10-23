# Boas práticas de interface para o F.O.G.O.

Pesquisa feita em 22/10/2026 para orientar a avaliação das telas do F.O.G.O. (inventário, central de operações e cidade preditiva). O usuário principal é um gestor da prefeitura de Marília que abre o sistema num notebook algumas vezes por dia. Ele não é um operador de sala de controle com turno de 8 horas olhando a tela o tempo todo, e isso muda o peso de algumas regras: a primeira leitura da tela precisa responder "está tudo bem?" em poucos segundos, e o que mudou desde a última visita precisa ser fácil de achar.

As fontes industriais (ISA-101, ISA-18.2, EEMUA 191) são normas pagas. Onde o texto da norma não está aberto, a referência é a página oficial da norma mais um material secundário que resume os números. Isso está indicado em cada seção.

## As 12 regras mais importantes para o F.O.G.O.

1. Cor só para o que está fora do normal. O estado normal fica em cinza, e vermelho, laranja e amarelo aparecem só quando há algo a fazer. Isso já é a base do projeto e deve ser mantido em toda tela nova, inclusive nos gráficos da página preditiva.
2. Nenhuma informação depende só da cor. Situação, gravidade e risco precisam também de forma, ícone, padrão (zebrado, tracejado) ou texto. Hoje os equipamentos seguem isso, mas as ocorrências não.
3. Alerta crítico precisa exigir ação. Se um alerta não pede nenhuma ação do gestor agora, ele não é crítico. A meta de referência é cerca de 5% dos alertas em prioridade alta, 15% em média e 80% em baixa.
4. Alerta parado há dias deixa de ser alerta. Alertas que ficam ativos por mais de 24 horas sem mudança precisam de outro tratamento (lista de pendências, supressão com prazo, "fora de serviço"), senão o painel treina o usuário a ignorá-lo.
5. Mostrar a situação geral primeiro, o detalhe sob demanda. A tela inicial responde "como está a cidade e por quê"; o detalhe de cada item fica a um clique. É o nível 1 da hierarquia de telas do HMI de alto desempenho e o "suporte à consciência global" de Endsley.
6. Entregar a conclusão, não só o dado. O sistema deve dizer o que o dado significa (nível 2 de Endsley) e o que tende a acontecer (nível 3), como já faz a frase de motivo da situação da cidade.
7. Mostrar a idade dos dados. Em tela ao vivo, o usuário precisa saber quando foi a última atualização e perceber na hora quando a conexão cai e os números ficam velhos.
8. Atualizar sem fazer a tela pular. Listas e tabelas ao vivo não devem reordenar linhas enquanto a pessoa lê ou está com o foco nelas; animação só para chegada de alerta crítico e com respeito a `prefers-reduced-motion`.
9. Previsão sempre com incerteza e com a qualidade do modelo ao lado. Mostrar intervalo ou faixa, usar frequências ("3 em cada 10") em vez de só porcentagens e explicar o teste retroativo em linguagem simples.
10. Formulários no padrão GOV.UK: rótulo visível fora do campo, dica abaixo do rótulo, erro junto do campo e resumo de erros no topo com links, botão nunca desabilitado sem explicação, CEP com busca e opção clara de preencher à mão.
11. WCAG 2.2 AA (base da ABNT NBR 17225:2025): contraste de 4,5:1 para texto e 3:1 para bordas de campo, ícones e marcadores, foco visível e não encoberto, alvos de pelo menos 24 por 24 px, mensagens de status anunciadas sem roubar o foco, e alternativa por teclado ao que só existe no mapa.
12. Texto em linguagem simples, como pede a Lei 15.263/2025: frase curta, ordem direta, voz ativa, o mais importante primeiro, sem siglas não explicadas e sem plurais do tipo "dia(s)".

## 1. ISA-101 e HMI de alto desempenho

A prática: o fundo e os elementos em estado normal ficam em tons de cinza de baixo contraste; cores saturadas aparecem só para condições anormais e alarmes; a cor de alarme nunca é usada para estado normal (por exemplo, verde para "ligado"). As telas são organizadas em hierarquia: um nível 1 com a visão geral de toda a área de responsabilidade (indicadores principais, alarmes de maior prioridade e o estado de reconhecimento deles, situação dos equipamentos principais, tendências), um nível 2 por unidade, um nível 3 de detalhe e um nível 4 de diagnóstico. Valores vêm acompanhados de contexto (faixa normal, tendência) em vez de números soltos.

Por quê: quando tudo é colorido o tempo todo, a cor deixa de significar algo e a anomalia não se destaca. O white paper do consórcio ASM sobre fundo cinza explica a razão perceptiva: o contraste reservado para o anormal faz o problema ser encontrado sem busca ativa. A ISA-101 em si não fixa cores; ela exige que a organização tenha uma filosofia e um guia de estilo de HMI e que os siga com consistência. Para o F.O.G.O., o guia de estilo já existe na prática (tokens em `src/web/styles.css` e `src/web/colors.ts`); falta tratar como regra também o verde do indicador "Ao vivo" e as cores categóricas da página preditiva.

Adaptação ao F.O.G.O.: o nível 1 é a central de operações (situação de Marília, contadores, mapa). O nível 2 é a aba de regiões e o filtro por região. O nível 3 é a gaveta de detalhes de equipamento, agente e ocorrência. O nível 4 é a telemetria de 48 horas e o histórico.

Fontes:

- ISA-101.01, página oficial: https://www.isa.org/standards-and-publications/isa-standards/isa-101-standards
- ASM Consortium, "Why Gray Backgrounds for DCS Operating Displays?" (Bullemer, Reising, Laberge, 2011): https://process.honeywell.com/content/dam/process/en/documents/document-lists/doc_asm-consortium/white-papers/February%2028%202011%20-%20Why%20Gray%20Backgrounds%20for%20DCS%20Operating%20Displays.pdf
- ASM Consortium, segunda edição das diretrizes "Effective Console Operator HMI Design Practices" (2013): https://www.automation.com/en-us/articles/2013-2/asm-publishes-2nd-edition-of-hmi-design-guidelines
- Hollifield, "The High Performance HMI" (resumo do livro e da hierarquia de 4 níveis): https://www.automation.com/article/the-high-performance-hmi
- Opto22, white paper com o conteúdo do nível 1 citando Hollifield: https://documents.opto22.com/2061_High_Performance_HMI_white_paper.pdf
- Rockwell Automation, Process HMI Style Guide: https://literature.rockwellautomation.com/idc/groups/literature/documents/wp/proces-wp023_-en-p.pdf

## 2. Gestão de alarmes e fadiga de alertas (ISA-18.2, EEMUA 191)

A prática: cada alarme precisa indicar uma condição anormal que exige resposta do operador; se ninguém precisa agir, não é alarme (é evento, registro ou relatório). As prioridades são poucas (3 ou 4) e distribuídas de forma desigual, com referência de cerca de 80% baixa, 15% média e 5% alta. As referências de taxa para um operador são cerca de 6 alarmes por hora como aceitável e 12 por hora como máximo administrável; mais de 10 alarmes em 10 minutos caracteriza inundação. Alarmes "velhos" (ativos há mais de 24 horas) devem ser menos de 5 por dia. O ciclo de vida separa reconhecer (o operador viu) de resolver (a condição acabou). Prateleira (shelving) é a supressão temporária feita pelo operador, com prazo e retorno automático, e o sistema deve sempre mostrar a lista do que está suprimido ou fora de serviço. Supressão por projeto esconde alarmes que não fazem sentido no estado atual do sistema.

Por quê: alarmes demais ou com prioridade inflada levam o usuário a ignorar todos, inclusive o que importa. Esse é o mecanismo da fadiga de alertas, e o painel de alertas do F.O.G.O. está exposto a ele (ver "Problemas prováveis").

Adaptação ao F.O.G.O.: o gestor não está de plantão, então a taxa de alertas por hora importa menos que o estoque de alertas ativos e a proporção de críticos. Furtos antigos, equipamentos parados há semanas e manutenção prevista para daqui a 3 dias não pedem ação imediata e deveriam sair do topo da lista ou ir para uma aba de pendências. Cada alerta crítico deveria dizer a ação esperada e quem é o responsável.

Fontes:

- ANSI/ISA-18.2-2016, página oficial: https://www.isa.org/standards-and-publications/isa-standards/isa-18-series-of-standards
- ISA Ireland, "Alarm System Performance Metrics" (Kim Van Camp), com as tabelas de taxa, distribuição de prioridade e alarmes velhos: https://isa.ie/wp-content/uploads/2016/06/Alarm_System_Performance_Metrics_Kim_Van_camp.pdf
- EEMUA 191, 4ª edição (2024), página da publicação: https://www.eemua.org/products/publications/digital/eemua-publication-191
- IChemE, definições de shelving e métricas de racionalização: https://www.icheme.org/media/17392/lc-0151_21-lead-process-safety-metrics-alarm-rationalisation-final.pdf
- Siemens, white paper de gestão de alarmes (lista obrigatória de alarmes suprimidos): https://assets.new.siemens.com/siemens/assets/api/uuid:234f1026-298f-49dc-8961-0c5223c38588/white-paper-alarm-management-2021-final.pdf

## 3. Consciência situacional (Endsley)

A prática: Endsley define três níveis de consciência situacional: perceber os elementos do ambiente, compreender o que significam e projetar o estado futuro. O projeto orientado a consciência situacional (SA-oriented design) começa por uma análise de tarefas por objetivo e segue princípios como: organizar a informação em torno dos objetivos do usuário, apresentar diretamente a compreensão e a projeção em vez de deixar o usuário juntar dados soltos, manter sempre uma visão global com detalhe sob demanda, deixar salientes os sinais que indicam situações típicas e remover o que não serve à decisão.

Por quê: a atenção e a memória de trabalho são o gargalo. Uma tela que exige somar mentalmente "4 de 5 regiões em atenção + 27 alertas críticos + 15 equipamentos parados" para chegar a "a cidade está como?" consome exatamente o recurso escasso.

Adaptação ao F.O.G.O.: o bloco "Situação de Marília" com o nível e o motivo em uma frase é um bom exemplo de nível 2 entregue pronto. Faltam o nível 3 na central (o que tende a acontecer nas próximas horas, que hoje mora só na página preditiva) e um sinal de "o que mudou desde a última vez que você olhou", útil para quem entra algumas vezes por dia. A escala de estágios do Centro de Operações Rio (estágios 1 a 5, com descrição curta do que cada um significa para a cidade) é uma referência local para dar nome e critério a cada nível.

Fontes:

- Endsley, M. R. (1995). "Toward a Theory of Situation Awareness in Dynamic Systems". Human Factors 37(1), 32-64. https://journals.sagepub.com/doi/10.1518/001872095779049543
- Endsley, "Designing for Situation Awareness in Complex Systems" (princípios de projeto): https://www.researchgate.net/profile/Mica-Endsley/publication/238653506_Designing_for_situation_awareness_in_complex_system/links/542b1ada0cf29bbc126a7f35/Designing-for-situation-awareness-in-complex-system.pdf
- Endsley e Jones, "Designing for Situation Awareness: An Approach to User-Centered Design" (sumário): https://www.gbv.de/dms/tib-ub-hannover/602032229.pdf
- Centro de Operações Rio, estágios operacionais: https://cor.rio/centro-de-operacoes-rio-apresenta-os-novos-estagios-operacionais-da-cidade/ e https://cor.rio/faq/

## 4. Painéis, tabelas, filtros, abas e estados vazios

A prática para painéis: Stephen Few define painel como a informação mais importante para um ou mais objetivos, organizada numa única tela para ser acompanhada de relance. Entre os erros comuns que ele lista estão passar de uma tela, dar contexto insuficiente para os números, mostrar detalhe ou precisão demais e codificar quantidades de forma imprecisa. A NN/g separa painel operacional (decisão imediata, sensível ao tempo) de painel analítico (investigação) e recomenda usar atributos pré-atentivos (posição, comprimento, cor, forma) com parcimônia; num estudo da NN/g, cor e ícone juntos foram mais rápidos de distinguir que só texto. A central do F.O.G.O. é operacional; a página preditiva é analítica e pode ser mais longa.

A prática para tabelas: a NN/g lista quatro tarefas que a tabela precisa suportar: achar registros por critério, comparar, ver ou editar uma linha e agir sobre registros. O nome do registro deve ser um link de verdade (permite abrir em nova aba e é anunciado como link), o cabeçalho ordenável indica o sentido da ordenação (`aria-sort`) e filtros aplicados ficam visíveis com contagem de resultados.

A prática para filtros: filtros interativos (o resultado muda a cada escolha) servem a quem explora e funcionam quando a resposta é instantânea, como no F.O.G.O. Os nomes de filtro e valor devem ser previsíveis e sem jargão. O estado dos filtros deveria sobreviver à navegação (na URL), para o usuário voltar da ficha de um equipamento e encontrar a lista como deixou.

A prática para abas: abas servem para alternar entre visões relacionadas que não precisam ser vistas ao mesmo tempo. O padrão ARIA de abas exige navegação por setas entre as abas (tabindex móvel), com ativação automática quando o painel aparece sem demora.

A prática para estados vazios: o estado vazio informa o estado do sistema, ensina e oferece um caminho. Uma lista vazia por causa de filtro deve dizer isso e oferecer "limpar filtros"; uma lista vazia porque não há problemas deve dizer que não há problemas, sem afirmar mais do que sabe.

A prática para divulgação progressiva: mostrar primeiro as poucas opções mais importantes e deixar as avançadas a um clique. O que aparece na primeira tela comunica importância.

Fontes:

- Stephen Few, "Common Pitfalls in Dashboard Design": https://www.perceptualedge.com/articles/Whitepapers/Common_Pitfalls.pdf
- Stephen Few, "Dashboard Confusion Revisited": http://perceptualedge.com/articles/visual_business_intelligence/dboard_confusion_revisited.pdf
- NN/g, "Dashboards: Making Charts and Graphs Easier to Understand": https://www.nngroup.com/articles/dashboards-preattentive/
- NN/g, "Visual Indicators to Differentiate Items in a List": https://www.nngroup.com/articles/visual-indicators-differentiators/
- NN/g, "Data Tables: Four Major User Tasks": https://www.nngroup.com/articles/data-tables/
- NN/g, "User Intent Affects Filter Design": https://www.nngroup.com/articles/applying-filters/
- NN/g, "Defining Helpful Filter Categories and Values": https://www.nngroup.com/articles/filter-categories-values/
- NN/g, "Tabs, Used Right": https://www.nngroup.com/articles/tabs-used-right/
- W3C WAI-ARIA APG, Tabs Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- NN/g, "Designing Empty States in Complex Applications": https://www.nngroup.com/articles/empty-state-interface-design/
- NN/g, "Progressive Disclosure": https://www.nngroup.com/articles/progressive-disclosure/

## 5. Mapas

A prática: o mapa base fica apagado (pouco contraste, sem cor) para os dados operacionais se destacarem, o que o F.O.G.O. já faz em `src/web/map/basemap.ts`. Pontos próximos são agrupados (clustering), com o grupo carregando um resumo do que importa (no F.O.G.O., o selo de parados). A legenda precisa estar acessível e explicar cada forma e cor; quando fica escondida atrás de um botão, o mapa precisa ser legível sem ela, o que pede formas e padrões autoexplicativos. Mapa coroplético (área pintada) deve mostrar taxas ou índices, não contagens brutas, porque a área do bairro passa a pesar tanto quanto o valor; contagens ficam melhor como símbolo proporcional. Paletas sequenciais vêm de conjuntos testados para daltonismo (ColorBrewer, viridis), com 5 a 7 classes, e "sem dado" tem aparência diferente de zero. Contorno tracejado e hachura são alternativas à cor e funcionam para daltônicos.

Acessibilidade de mapa: camadas desenhadas no canvas do MapLibre não recebem foco do teclado. Tudo o que só pode ser feito clicando no mapa precisa de um caminho equivalente fora dele, normalmente uma lista sincronizada com o mapa. Marcadores DOM (como as ocorrências do F.O.G.O.) recebem foco, mas muitos marcadores focáveis tornam a navegação por Tab interminável.

Desempenho no MapLibre: clustering no próprio GeoJSON source reduz o número de feições desenhadas; `setData` reprocessa tudo no worker e, chamado com frequência alta, pode travar a thread principal; `updateData` aplica mudanças incrementais e é mais barato para atualizações ao vivo. Com 282 equipamentos e atualização a cada 2 segundos o F.O.G.O. está longe do limite, mas vale medir se a frota crescer.

Fontes:

- MapLibre, "Optimising MapLibre Performance: Tips for Large GeoJSON Datasets": https://maplibre.org/maplibre-gl-js/docs/guides/large-data/
- MapLibre, `GeoJSONSource` (`setData`, `updateData`): https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/
- MapLibre, "Create and style clusters": https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/
- ColorBrewer: https://colorbrewer2.org/
- Governo de Minnesota, "Accessibility Guide for Interactive Web Maps": https://mn.gov/mnit/assets/Accessibility%20Guide%20for%20Interactive%20Web%20Maps_tcm38-403564.pdf
- Estudo de acessibilidade de mapas web (Mapbox GL e MapLibre falham em teclado por padrão): https://link.springer.com/article/10.1007/s42489-025-00189-x
- Leaflet, guia de acessibilidade (padrões de referência para marcadores focáveis): https://leafletjs.com/examples/accessibility/

## 6. Previsões, incerteza e testes retroativos

A prática: toda previsão mostra a incerteza junto, de preferência em formato de frequência ("em 10 dias parecidos, 7 tiveram pelo menos uma ocorrência") em vez de só probabilidade. Representações discretas como o gráfico de pontos por quantil (quantile dotplot) e a distribuição acumulada levaram a decisões melhores que texto ou densidade em experimentos com usuários leigos. Linhas de projeção ganham faixa de incerteza que se abre com o horizonte. Gráficos são acompanhados de palavras e números, e uma boa tabela-resumo também é uma visualização. A qualidade do modelo é apresentada em termos de decisão ("dos 10% de horários mais arriscados, quantas ocorrências caíram ali") e comparada com uma referência simples, o que a página preditiva já faz. Quando o resultado do teste varia conforme a janela, a variação deve aparecer.

Por quê: um número só ("2,4 ocorrências esperadas") é lido como certeza. Leigos tendem a ignorar a incerteza quando ela não está desenhada.

Fontes:

- Kay, Kola, Hullman e Munson (2016). "When (ish) is My Bus? User-centered Visualizations of Uncertainty in Everyday, Mobile Predictive Systems". CHI '16. https://mucollective.northwestern.edu/project/when-ish-is-my-bus
- Fernandes et al. (2018). "Uncertainty displays using quantile dotplots or CDFs improve transit decision-making". CHI '18. https://doi.org/10.1145/3173574.3173718
- Padilla, Kay e Hullman, "Uncertainty Visualization" (revisão, inclui o enquadramento por frequência): https://friendly.github.io/6135/papers/Uncertainty_Visualization_Padilla_Kay_Hullman_2020.pdf
- Spiegelhalter, Pearson e Short (2011). "Visualizing Uncertainty About the Future". Science 333(6048). https://www.science.org/doi/abs/10.1126/science.1191181
- Hullman, Resnick e Adar (2015), Hypothetical Outcome Plots: https://doi.org/10.1371/journal.pone.0142444

## 7. Formulários de inventário

A prática (GOV.UK e sistemas derivados): rótulo sempre visível fora do campo; dica entre o rótulo e o campo, ligada por `aria-describedby`; placeholder não substitui rótulo nem dica e não deve parecer valor já preenchido. Validação no envio, com resumo de erros no topo (foco vai para ele, cada item é link para o campo) e mensagem junto do campo que diz o que fazer ("Digite o CEP com 8 números"), não só "campo inválido". A mensagem do resumo e a do campo usam o mesmo texto. Botão desabilitado tem contraste baixo e não explica por quê; a recomendação é deixar o botão ativo e explicar o erro ao clicar. Campos opcionais são marcados como "(opcional)" em vez de marcar os obrigatórios com asterisco. Formulários longos são divididos em grupos (`fieldset` com `legend`). Ao sair com alterações não salvas, o sistema avisa.

Endereço e CEP: o padrão de busca de endereço do governo britânico (DWP, Escócia) pede busca por código postal, opção de digitar o endereço à mão a qualquer momento e, quando a busca não acha nada, repetir o que foi buscado e oferecer tentar de novo ou preencher manualmente. Para o Brasil, o CEP tem 8 dígitos (formato 00000-000); o campo aceita com ou sem hífen, usa `inputmode="numeric"` e `autocomplete="postal-code"`, e a busca pode disparar sozinha ao completar 8 dígitos. Depois de preencher, o sistema mostra o que preencheu e deixa corrigir, o que o F.O.G.O. já faz.

Fontes:

- GOV.UK Design System, Error message: https://design-system.service.gov.uk/components/error-message/
- GOV.UK Design System, Error summary: https://design-system.service.gov.uk/components/error-summary/
- GOV.UK Design System, Validation: https://design-system.service.gov.uk/patterns/validation/
- GOV.UK Design System, Button (botões desabilitados e duplo envio): https://design-system.service.gov.uk/components/button/
- GOV.UK Design System, Addresses: https://design-system.service.gov.uk/patterns/addresses/
- DWP Design System, Find an address: https://design-system.dwp.gov.uk/patterns/find-an-address
- Scottish Government Design System, Addresses: https://designsystem.gov.scot/patterns/addresses
- NN/g, "Placeholders in Form Fields Are Harmful": https://www.nngroup.com/articles/form-design-placeholders/
- CMS Design System, Error validation (não usar botão de envio desabilitado): https://design.cms.gov/patterns/Forms/error-validation/
- ViaCEP: https://viacep.com.br/

## 8. Acessibilidade (WCAG 2.2 AA e ABNT NBR 17225)

A prática: a ABNT NBR 17225:2025 é a norma brasileira de acessibilidade web, baseada na WCAG 2.2, com 96 requisitos obrigatórios (níveis A e AA) e 50 recomendações (AAA). Os pontos que mais pesam no F.O.G.O.:

- Contraste de texto de 4,5:1 (3:1 para texto grande) e de 3:1 para componentes de interface e gráficos necessários para entender o conteúdo: borda de campo, ícone, marcador no mapa, segmento de gráfico (1.4.3 e 1.4.11).
- Cor não pode ser o único meio de transmitir informação (1.4.1).
- Foco visível e não totalmente encoberto por conteúdo do próprio site, como barras fixas e painéis sobre o mapa (2.4.7 e 2.4.11).
- Alvos de toque e clique com pelo menos 24 por 24 px ou espaçamento equivalente (2.5.8).
- Toda ação feita arrastando tem alternativa sem arrasto (2.5.7). No F.O.G.O. o marcador do formulário pode ser arrastado, mas clicar no mapa ou digitar as coordenadas também funciona.
- Mensagens de status anunciadas sem mover o foco (4.1.3), com `role="status"` ou `aria-live="polite"`. Regiões ao vivo que mudam a cada poucos segundos devem anunciar só o que importa, com limite de frequência; `role="log"` serve para fluxo de eventos, e anúncios assertivos ficam reservados para o que é urgente.
- Conteúdo que se move ou pisca sozinho por mais de 5 segundos, ao lado de outro conteúdo, precisa de um jeito de pausar ou esconder (2.2.2). O pulso infinito das ocorrências e do indicador "Ao vivo" se enquadra; respeitar `prefers-reduced-motion` ajuda, mas não substitui um controle na interface. Movimentos de câmera do mapa (`flyTo`, `easeTo`) também devem ser instantâneos quando o usuário pede menos movimento.
- Teclado: tudo operável por teclado, sem armadilha (2.1.1 e 2.1.2), com link para pular a navegação (2.4.1) e foco devolvido ao elemento de origem quando um painel ou diálogo fecha.

Fontes:

- W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C, "What's New in WCAG 2.2": https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- W3C, Understanding 4.1.3 Status Messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- W3C, Understanding 2.2.2 Pause, Stop, Hide: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- W3C, Understanding 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- ABNT NBR 17225:2025 (PDF publicado pela Câmara dos Deputados): https://www2.camara.leg.br/a-camara/estruturaadm/gestao-na-camara-dos-deputados/responsabilidade-social-e-ambiental/acessibilidade/pdfs/ABNTNBR17225AcessibilidadeDigitalparaWeb.pdf
- CTA do IFRS, resumo da NBR 17225: https://cta.ifrs.edu.br/abnt-nbr-17225-2025-acessibilidade-em-conteudo-e-aplicacoes-web-requisitos/
- MDN, ARIA live regions: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
- MDN, `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

## 9. Tempo real

A prática: o sistema informa sempre o próprio estado (primeira heurística de Nielsen). Em tela ao vivo isso significa mostrar a hora da última atualização dos dados (não só a hora do relógio), mudar de forma visível quando a conexão cai e, depois de um tempo sem dados, marcar números e marcadores como desatualizados. O ritmo de atualização da tela não precisa ser o mesmo dos dados: posições de agentes podem andar a cada 2 segundos, mas contadores, listas e textos que a pessoa lê devem mudar só quando o valor muda, sem reordenar a lista sob o cursor. Novos itens entram sem empurrar o que está sendo lido (ou com aviso "3 alertas novos" para o usuário trazer quando quiser). Tempos de resposta seguem os limites clássicos: até 0,1 s parece instantâneo, até 1 s mantém o fluxo, acima de 10 s pede indicador de progresso.

Fontes:

- NN/g, "10 Usability Heuristics" (visibilidade do estado do sistema): https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g, "Response Times: The 3 Important Limits": https://www.nngroup.com/articles/response-times-3-important-limits/
- Hollifield, nível 1 com alarmes e estado de reconhecimento: https://www.automation.com/article/the-high-performance-hmi
- W3C, Understanding 2.2.2 (conteúdo que se atualiza sozinho pode ter controle de frequência): https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

## 10. Linguagem simples e escrita em português para governo

A prática: a Lei 15.263, de 14/11/2025, criou a Política Nacional de Linguagem Simples e vale para órgãos de todos os entes, inclusive municípios. Ela pede frases curtas em ordem direta, voz ativa, explicação de termos técnicos, informação principal primeiro, nome completo antes da sigla e proíbe flexões fora das regras da língua. O Manual de Linguagem Simples da Câmara (2024) e a curadoria do Portal do Servidor dão o método: definir o público, ir direto ao ponto, trocar substantivos abstratos por verbos, evitar jargão e testar o texto com quem vai ler.

Aplicação em interface: botões com verbo e objeto ("Reconhecer alerta", "Cadastrar equipamento"); mensagens de erro que dizem como corrigir; números com unidade e plural certo ("1 dia", "3 dias") em vez de "dia(s)"; horários no formato brasileiro (21h, 21h às 23h); siglas explicadas na primeira vez (GCM, PTZ, OCR); termos estatísticos traduzidos para o efeito prático ("chance de acontecer por acaso: menos de 1 em 10 mil" em vez de "p < 0,01%").

Fontes:

- Lei 15.263/2025: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm
- Portal do Servidor, Linguagem Simples: https://www.gov.br/servidor/pt-br/assuntos/laboragov/curadoria-tematica/linguagem-simples
- Manual de Linguagem Simples (Patricia Roedel, Edições Câmara, 2024): https://www.gov.br/servicoscompartilhados/pt-br/acesso-a-informacao/acoes-e-programas/governanca/arquivos_figuras/linguagem_simples_roedel.pdf
- ABNT NBR ISO 24495-1:2024, Linguagem simples, citada no manual acima.

## 11. Tema escuro

A prática: usar cinza escuro em vez de preto puro como superfície; expressar elevação com superfícies um pouco mais claras, não com brilho; dessaturar as cores de destaque para não vibrarem sobre o fundo escuro; garantir 4,5:1 para texto em todas as superfícies, inclusive a mais clara; não reduzir contraste de texto com opacidade (texto secundário ganha uma cor própria que passe no contraste). Cores de alarme muito saturadas sobre fundo escuro funcionam bem como área ou borda, mas como texto pequeno costumam precisar de uma variante mais clara, como o F.O.G.O. já faz com `--critical-text`.

Fontes:

- Material Design 2, Dark theme: https://m2.material.io/design/color/dark-theme.html
- ASM Consortium, fundo cinza em telas de operação (link na seção 1).

## 12. Telas pequenas em ferramenta de operação

A prática: o uso principal é no notebook, mas o gestor vai abrir no celular numa emergência. No celular, a prioridade é ler a situação e os alertas e localizar um item, não editar inventário. Lista antes do mapa (ou alternância lista e mapa) funciona melhor que um mapa espremido; tabelas largas viram rolagem horizontal com a primeira coluna fixa ou lista de cartões só quando a comparação entre linhas não importa; alvos de toque com 44 px quando possível (o próprio padrão gov.br usa área mínima de interação em torno de 44 px). Filtros em painel deslizante com contagem de resultados visível.

Fontes:

- NN/g, "Mobile Faceted Search with a Tray": https://www.nngroup.com/articles/mobile-faceted-search/
- NN/g, "Data Tables" (seção sobre tabelas que não cabem na tela): https://www.nngroup.com/articles/data-tables/
- Padrão Digital de Governo V4, fundamento Estado (área mínima de interação de 44 px): https://next-ds.estaleiro.serpro.gov.br/fundamentos/estado
- Governo de Minnesota, opção de lista em vez de mapa no celular (link na seção 5).

## 13. Status por forma, cor e texto (referências de sistemas de design)

A prática: o padrão de indicadores de status do Carbon (IBM) combina cor, forma, símbolo e texto e classifica por gravidade; a paleta Okabe-Ito (Color Universal Design) é a referência para cores categóricas seguras para daltonismo e evita o par vermelho e verde. Cerca de 8% dos homens têm alguma deficiência de visão de cores. A recomendação comum é testar as cores com simulação de protanopia, deuteranopia e tritanopia e exigir uma pista redundante (forma, padrão, texto) para todo estado.

Fontes:

- Carbon Design System, Status indicators: https://carbondesignsystem.com/patterns/status-indicator-pattern/
- Okabe e Ito, Color Universal Design: https://jfly.uni-koeln.de/color/

## 14. Padrão Digital de Governo (gov.br DS)

O que é: o design system do governo federal, mantido pelo Serpro, com fundamentos (cores, tipografia Rawline, espaçamento em base 8, superfícies e estados), componentes (cabeçalho, menu, mensagem, tabela, tag, upload, entre outros), padrões e templates, com código aberto (`@govbr-ds/core`) e compromisso com e-MAG e WCAG. Ele foi feito para serviços ao cidadão em fundo claro, com o azul institucional #1351B4 como cor primária.

O que serve ao F.O.G.O.: os padrões de escrita e de formulário (mensagens de erro, mensagens de sucesso e aviso, estrutura de campos), a área mínima de interação de 44 px e a disciplina de estados (hover, foco, ativo, desabilitado) definidos como camada própria. O componente de mensagem e o padrão de tabela podem servir de checklist de conteúdo.

O que não serve: a identidade visual (azul institucional, Rawline, fundo claro) é de serviço federal ao cidadão; o F.O.G.O. é uma ferramenta interna municipal de operação, em tema escuro, com linguagem de sinalização viária e cor reservada para problemas. Adotar a paleta do gov.br colocaria azul saturado em elementos normais e quebraria a regra da ISA-101 que o projeto segue. A recomendação é adotar as regras de conteúdo, formulário e acessibilidade e manter a identidade visual própria.

Fontes:

- Padrão Digital de Governo: https://www.gov.br/ds/
- Padrão Digital de Governo V4, sobre: https://next-ds.estaleiro.serpro.gov.br/introducao/sobre
- `@govbr-ds/core`: https://www.npmjs.com/package/@govbr-ds/core
- Wiki do GOVBR-DS, roteiro de uso: https://govbr-ds.gitlab.io/tools/govbr-ds-wiki/desenvolvimento/guias/roteiro/

## Checklist de avaliação

Cada item pode ser conferido no navegador (inspeção, teclado, DevTools, leitor de tela) ou no código. Marcar como "passa", "falha" ou "não se aplica", com print ou caminho de arquivo como evidência.

### Todas as telas

- [ ] O título da aba muda a cada tela e descreve a tela (`document.title`).
- [ ] Existe um link "Pular para o conteúdo" que aparece ao receber foco e leva ao `main`.
- [ ] Há exatamente um `h1` por tela, visível ou não, e os títulos seguem a ordem h1, h2, h3 sem pular nível.
- [ ] Ao trocar de tela pela navegação, o foco vai para o `h1` ou para o `main`, e o leitor de tela anuncia a nova tela.
- [ ] Todo texto tem contraste de pelo menos 4,5:1 com o fundo real (medir no DevTools, incluindo texto com `opacity` e texto sobre o mapa).
- [ ] Bordas de campo, ícones de estado, marcadores do mapa e segmentos de gráfico têm pelo menos 3:1 contra o fundo adjacente.
- [ ] Nenhum estado (situação, gravidade, risco, nível) é transmitido só por cor: há forma, padrão, ícone ou texto junto. Conferir com o emulador de deficiência de visão de cores do DevTools (protanopia, deuteranopia, achromatopsia).
- [ ] Elementos em estado normal estão em cinza; nenhuma cor de alarme (vermelho, laranja, amarelo) aparece em algo normal; verde não é usado para "normal".
- [ ] Todo elemento interativo recebe foco por Tab, o anel de foco é visível e não fica totalmente coberto pela barra superior, pela barra de navegação inferior no celular ou por painéis sobre o mapa.
- [ ] Alvos clicáveis têm pelo menos 24 por 24 px (ou espaçamento equivalente); no celular, os principais têm 44 px.
- [ ] Com `prefers-reduced-motion: reduce` emulado no DevTools, não há pulsos, transições nem voos de câmera no mapa.
- [ ] Animações que repetem por mais de 5 segundos têm controle para pausar ou esconder.
- [ ] A 400 px de largura não há rolagem horizontal da página (tabelas e mapas podem rolar dentro do próprio contêiner) e nenhum texto fica cortado sem forma de ler.
- [ ] Com zoom de 200% no navegador o conteúdo continua utilizável.
- [ ] Os textos não usam "(s)", "(es)" ou "(is)" para plural; números e unidades seguem o padrão brasileiro (vírgula decimal, 21h, dd/mm/aaaa).
- [ ] Siglas e termos técnicos aparecem por extenso ou explicados na primeira ocorrência.
- [ ] Toda tela com dados ao vivo ou calculados mostra quando os dados foram gerados.

### Central de operações

- [ ] Em até 5 segundos de olhar a tela dá para dizer o nível da cidade (normal, atenção, crítico) e o motivo, sem abrir nada.
- [ ] O nível da cidade tem forma ou padrão além da cor (zebrado, tracejado) e o texto do nível é lido pelo leitor de tela.
- [ ] Há indicação da hora da última atualização dos dados, separada do relógio.
- [ ] Ao desligar a rede (DevTools, offline), em até 10 segundos a tela mostra que os dados estão parados e há quanto tempo; os números não continuam parecendo atuais.
- [ ] A proporção de alertas críticos entre os ativos é de no máximo cerca de 5% a 10%; contar no snapshot `/api/operations/snapshot`.
- [ ] Nenhum alerta crítico está ativo há mais de 24 horas sem ação; contar pelo campo `since`.
- [ ] Cada alerta crítico diz qual ação se espera e onde agir.
- [ ] Reconhecer um alerta dá retorno visível em menos de 1 segundo e, se falhar, mostra mensagem de erro.
- [ ] Existe forma de suprimir temporariamente um alerta (com prazo) e de ver a lista do que está suprimido, ou a ausência disso está justificada.
- [ ] O estado vazio da lista de alertas distingue "não há alertas nesta categoria" de "a cidade está normal" e não contradiz o nível da cidade.
- [ ] As abas Alertas e Regiões trocam com as setas esquerda e direita, só a aba ativa está na ordem de Tab (`tabindex="0"` na ativa e `-1` nas outras).
- [ ] A lista de alertas não reordena nem desloca o item que está com foco ou sob o cursor quando chega atualização.
- [ ] O leitor de tela não anuncia a lista inteira a cada atualização de 2 segundos; anúncios automáticos se limitam a alertas críticos novos.
- [ ] Todo item que pode ser aberto clicando no mapa (equipamento, agente, grupo, bairro) também pode ser aberto por teclado, por uma lista ou busca.
- [ ] Ocorrências diferenciam gravidade por algo além da cor (forma, tamanho, número ou rótulo).
- [ ] A legenda explica todas as formas, cores e padrões visíveis no mapa, incluindo zebrado, tracejado, selo de parados e linha de despacho.
- [ ] Ao fechar a gaveta de detalhes, o foco volta para o elemento que a abriu.
- [ ] A tecla Esc fecha só o elemento mais recente (menu de filtro aberto antes da gaveta).
- [ ] A contagem "x de y" dos filtros diz a que se refere (equipamentos) e os filtros aplicados ficam visíveis sem abrir os menus.
- [ ] Com o mapa de ruas fora do ar, o aviso aparece e bairros e marcadores continuam legíveis.

### Inventário (listas)

- [ ] O identificador de cada linha é um link (`<a href>`), que abre em nova aba com Ctrl+clique.
- [ ] Cabeçalhos ordenáveis são botões com `aria-sort` correto no `th`.
- [ ] Os filtros e a ordenação ficam na URL e são restaurados ao voltar da ficha de um item.
- [ ] A lista não muda de ordem enquanto o usuário lê, a não ser que ele tenha escolhido ordenar por um campo ao vivo; nesse caso a mudança é contida.
- [ ] A lista vazia por filtro diz isso e tem botão para limpar filtros.
- [ ] Os cartões de resumo que filtram a lista indicam o estado ativo com `aria-pressed` e com algo visível além da cor.
- [ ] A 400 px a tabela rola dentro do próprio contêiner e a primeira coluna continua identificável.

### Formulários

- [ ] Todo campo tem rótulo visível fora do campo, associado por `for` e `id`.
- [ ] Placeholder não é usado como rótulo nem como exemplo que pareça valor preenchido; exemplos ficam na dica.
- [ ] Campos opcionais estão marcados como "(opcional)".
- [ ] O CEP aceita com e sem hífen, usa `inputmode="numeric"` e `autocomplete="postal-code"`.
- [ ] O botão "Buscar CEP" fica ativo e, se o CEP estiver incompleto, explica o erro em vez de ficar desabilitado.
- [ ] Quando a busca de CEP falha ou não acha, a mensagem repete o CEP buscado e diz que dá para preencher à mão; a mensagem é anunciada (`role="status"`).
- [ ] Ao enviar com erros, aparece um resumo no topo que recebe o foco, cada item é link para o campo e o texto é igual ao da mensagem junto do campo.
- [ ] O resumo recebe foco a cada envio com erro, mesmo se o número de erros não mudou.
- [ ] As mensagens de erro dizem como corrigir, não apenas que o campo é inválido.
- [ ] O botão de salvar evita duplo envio sem ficar sem explicação.
- [ ] Ao sair com alterações não salvas, o sistema pergunta antes.
- [ ] O ponto no mapa pode ser definido sem arrastar (clique no mapa ou coordenadas digitadas).
- [ ] Grupos de campos usam `fieldset` e `legend`; grupos de opção (rádio) anunciam o rótulo do grupo.

### Cidade preditiva

- [ ] Toda previsão numérica mostra faixa ou intervalo, ou explica em frequência o quanto pode variar.
- [ ] Linhas de projeção têm faixa de incerteza, e o trecho projetado se diferencia do histórico por estilo de linha, não só por cor.
- [ ] O bloco de qualidade do modelo mostra a comparação com a referência simples e a variação entre janelas de teste, e diz quando foi calculado.
- [ ] Ao trocar o horizonte, o título e os dados mudam juntos (não aparece título de 12 horas com dados de 6 horas enquanto carrega).
- [ ] Cores categóricas dos gráficos (regiões) não usam vermelho, laranja ou amarelo de alarme e são distinguíveis com simulação de daltonismo; há rótulo direto ou legenda.
- [ ] Gráficos têm título, descrição textual e os valores principais acessíveis sem passar o mouse (tabela ou texto).
- [ ] Tooltip de gráfico funciona com teclado ou o mesmo valor está disponível em texto.
- [ ] Termos estatísticos (percentil, escore z, Poisson, p-valor) vêm traduzidos para o efeito prático.
- [ ] O mapa de risco usa paleta sequencial clara para o nível baixo com contraste mínimo de 3:1 entre as classes vizinhas na legenda, ou padrão adicional.

## Problemas prováveis no F.O.G.O. hoje

Encontrados lendo o código em 22/10/2026 e consultando o snapshot de `http://localhost:3210/api/operations/snapshot` com o servidor em execução. Cada item traz a gravidade estimada (alta, média, baixa) e a confiança.

1. Alertas críticos inflados e parados. O snapshot tinha 62 alertas ativos, 29 deles críticos (47%), nenhum reconhecido. Desses críticos, 20 eram "Furto registrado", o mais antigo ativo desde julho de 2026, e 5 eram câmeras com mau funcionamento ativas havia 3 dias. A referência é cerca de 5% de alta prioridade e menos de 5 alarmes velhos. Furto antigo não pede ação imediata do gestor e afoga as duas anomalias realmente novas (concentração de ocorrências em Banzato e Jardim Parati). A geração e a classificação ficam no servidor (`src/server/operations.ts`); a exibição em `src/web/components/AlertFeed.tsx`. Gravidade alta, confiança alta.

2. "Atenção" quase permanente. No mesmo snapshot, 4 das 5 regiões e 28 dos 78 bairros estavam em atenção, e a cidade estava em atenção por isso. Um alerta de região dizia "Disponibilidade de equipamentos em 0%; 2 equipamento(s) furtado(s)". Se o estado de atenção é o normal do dia a dia, ele deixa de chamar atenção. Vale revisar os limiares (`AVAILABILITY_ATTENTION_PCT` em `src/shared/catalog.ts` e a regra em `src/server/operations.ts`, linhas 194 e 445) e se equipamentos furtados ou desativados deveriam contar na disponibilidade da região. Gravidade alta, confiança média.

3. Não há supressão temporária de alertas nem lista de alertas tratados. Só existe reconhecer e reabrir (`src/web/components/AlertFeed.tsx`). Alertas reconhecidos continuam na lista com opacidade 0,6. Gravidade média, confiança alta.

4. Falha ao reconhecer um alerta passa em silêncio. `toggleAck` em `src/web/components/AlertFeed.tsx` usa `try/finally` sem `catch`; se a requisição falhar, o botão volta ao normal e nada é dito ao usuário. Gravidade média, confiança alta.

5. Estado vazio da lista de alertas afirma que a cidade está normal mesmo quando não está. "Nenhum alerta nesta categoria. A cidade está operando dentro do esperado." aparece para qualquer filtro vazio (por exemplo, "Manutenção") mesmo com a cidade em atenção ou crítica (`src/web/components/AlertFeed.tsx`). Gravidade média, confiança alta.

6. Lista de alertas inteira como região ao vivo. `<ul aria-live="polite" aria-relevant="additions">` em `src/web/components/AlertFeed.tsx` recebe dados a cada 2 segundos e é reconstruída ao trocar o filtro; leitores de tela podem anunciar muitos itens de uma vez, inclusive informativos. O ideal é uma região separada que anuncie só alertas críticos novos. Gravidade média, confiança média (depende do leitor de tela; precisa de teste com NVDA ou Orca).

7. Sem indicação da idade dos dados. O topo mostra "Ao vivo" ou "Reconectando" e o relógio atual (`src/web/App.tsx`), mas `receivedAt` (guardado em `src/web/live.ts`) não é exibido em lugar nenhum. Se a conexão cair, contadores e mapa continuam com cara de atuais. A página preditiva também não diz quando cada previsão foi calculada (`src/web/pages/PredictionsPage.tsx`). Gravidade média, confiança alta.

8. Verde usado para estado normal. O ponto "Ao vivo" usa `--good` (#0ca30c) com pulso infinito (`src/web/styles.css`, regra `.live-dot[data-on="true"]::before`). Pela própria regra do projeto, normal fica em cinza; a cor e o movimento deveriam aparecer quando a conexão cai. Gravidade baixa, confiança alta.

9. Gravidade das ocorrências só por cor. Os marcadores de ocorrência são círculos de 18 px com a cor da gravidade (`paintOccurrence` em `src/web/map/OperationsMap.tsx`, `SEVERITY_COLORS` em `src/web/colors.ts`); alta (#ec835a) e crítica (#d03b3b) ficam muito próximas para quem tem protanopia ou deuteranopia. A legenda também usa só pontos coloridos (`src/web/map/LayerPanel.tsx`). Gravidade média, confiança alta.

10. Equipamentos e agentes no mapa sem acesso por teclado. As camadas `equipment-points`, `agents` e `equipment-clusters` são desenhadas no canvas (`src/web/map/OperationsMap.tsx`) e só respondem a clique. Na central não há lista de equipamentos ou agentes para abrir a gaveta por teclado; o único caminho é pelo título de um alerta. Gravidade média, confiança alta.

11. Abas da central sem navegação por setas. Os botões `role="tab"` em `src/web/pages/OperationsPage.tsx` não têm `onKeyDown` nem `tabIndex` móvel, ao contrário do padrão ARIA de abas. Gravidade baixa, confiança alta.

12. Foco não volta ao fechar a gaveta de detalhes, e Esc fecha mais de uma coisa. `DetailDrawer` foca o botão de fechar ao abrir, mas não devolve o foco ao fechar; o listener de Esc fica em `window` e dispara junto com o do menu de filtro (`src/web/components/DetailDrawer.tsx` e `src/web/components/MapFilterBar.tsx`). Gravidade baixa, confiança média.

13. Sem link para pular a navegação e sem gestão de foco na troca de tela. Não há "Pular para o conteúdo" em `src/web/App.tsx`; a troca de rota só faz `window.scrollTo(0, 0)`, sem mover o foco para o novo `h1`. Gravidade baixa, confiança alta.

14. Contraste insuficiente em elementos não textuais e em texto atenuado. Medições com os tokens de `src/web/styles.css` e `src/web/colors.ts`:
    - borda de campo `--line-strong` #434b54 sobre `--ground` #181b1f: 1,95:1 (o mínimo para borda de campo é 3:1);
    - agente em intervalo #555b63 sobre o mapa #111417: 2,70:1, e agente fora de serviço #3d4249: 1,83:1;
    - risco baixo #3a4048 sobre a superfície #1f2328: 1,51:1 (aceitável como fundo "apagado" no mapa, mas falha como amostra de legenda);
    - texto `--muted` em alerta reconhecido com `opacity: 0.6`: cerca de 2,98:1 em fonte de 12 px;
    - nomes de rua do mapa base #69717b sobre #111417: 3,74:1 (texto de mapa base é decorativo, mas fica abaixo de 4,5:1).
      Gravidade média, confiança alta para os números; a necessidade de 3:1 para agentes em intervalo depende de o estado ser informação relevante.

15. Plural com "(s)" em vários textos. Exemplos: `src/web/pages/PredictionsPage.tsx` linhas 96, 122, 279 e 545 ("crítico(s)", "ocorrência(s) esperada(s)", "agente(s)", "ponto(s) percentual(is)"), `src/web/pages/EquipmentListPage.tsx` linha 230, `src/web/components/DetailDrawer.tsx` linhas 85 e 87, `src/web/components/charts/WeekHeatmap.tsx` linha 98, e textos de alerta gerados no servidor ("Manutenção prevista em 1 dia(s)", "1 equipamento(s) furtado(s)"). A Lei 15.263/2025 pede flexões conforme a norma da língua. Gravidade baixa, confiança alta.

16. Texto estatístico pouco acessível nos alertas de anomalia. "A chance de isso acontecer por acaso é de menos de 0,01%" é correto, mas para leigo "menos de 1 em 10 mil" é mais fácil de entender (enquadramento por frequência). Gravidade baixa, confiança média.

17. Previsões sem incerteza visível. O risco por bairro mostra "x ocorrências esperadas" como número único (`RiskSection` em `src/web/pages/PredictionsPage.tsx`); a projeção de 30 dias é uma linha tracejada sem faixa (`src/web/components/charts/LineChart.tsx`); o teste retroativo mostra um único valor, embora o README diga que o resultado varia de 17% a 24% conforme a janela. Gravidade média, confiança alta.

18. Cores categóricas da página preditiva em tons de alarme. `REGION_COLORS` em `src/web/pages/PredictionsPage.tsx` inclui #d95926 (laranja avermelhado) e #c98500 (âmbar) para regiões em estado normal, o que conflita com a regra de cor só para problemas. Gravidade baixa, confiança alta.

19. Título e dados desencontrados ao trocar o horizonte. `useFetch` (`src/web/useFetch.ts`) devolve o dado anterior enquanto o novo carrega, e `RiskSection` monta o título com o novo `hours`; por um instante aparece "próximas 12 horas" com dados de 6 horas. Gravidade baixa, confiança média.

20. Lista de equipamentos com linha que navega por botão e estado que se perde. Em `src/web/pages/EquipmentListPage.tsx`, o número de série é um `<button>` que chama `navigate`, não um link, então não abre em nova aba e é anunciado como botão. Filtros e ordenação ficam em `useState` e se perdem ao voltar da ficha. Ordenada por "último contato", a tabela reordena a cada atualização de 2 segundos. Gravidade média, confiança alta.

21. CEP com placeholder que parece valor e botão desabilitado. Em `src/web/pages/EquipmentFormPage.tsx` (por volta da linha 355), o campo usa `placeholder="17500-000"`, que é um CEP válido de Marília e pode ser confundido com valor preenchido, não tem `autocomplete="postal-code"` e o botão "Buscar CEP" fica desabilitado até haver 8 dígitos, sem dizer por quê. Gravidade baixa, confiança alta.

22. Resumo de erros só recebe foco quando o número de erros muda. `ErrorSummary` em `src/web/components/form.tsx` usa `entries.length` como dependência do efeito; um segundo envio com o mesmo número de erros não move o foco de novo. Gravidade baixa, confiança alta.

23. Sem aviso de alterações não salvas nos formulários de equipamento e agente. Não há `beforeunload` nem confirmação ao navegar (`src/web/pages/EquipmentFormPage.tsx`, `src/web/pages/AgentFormPage.tsx`). Gravidade baixa, confiança alta.

24. Movimento de câmera do mapa ignora `prefers-reduced-motion`. `flyTo` e `easeTo` em `src/web/map/OperationsMap.tsx` animam sempre; o bloco de movimento reduzido em `src/web/styles.css` cobre só CSS. Também não há controle na interface para parar o pulso das ocorrências (WCAG 2.2.2). Gravidade baixa, confiança alta.

25. Alvos pequenos. O botão "Reconhecer" (`.alert-ack` em `src/web/styles.css`) tem texto de 12 px com 2 px de padding vertical, cerca de 22 px de altura; os marcadores de ocorrência têm 18 px. Podem passar pela exceção de espaçamento do critério 2.5.8, mas ficam abaixo dos 44 px recomendados para toque. Gravidade baixa, confiança média.
