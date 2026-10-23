# Geografia realista de Marília: fontes e plano

Pesquisa feita em 22/10/2026. Os números de OSM e IBGE vêm de consultas feitas nesse dia (Overpass e FTP do IBGE). Itens que não consegui verificar estão marcados como tal.

## Recomendação

Não existe fonte aberta com polígonos de bairros de Marília. O IBGE publicou a malha de bairros do Censo 2022, mas ela cobre só 58 municípios de São Paulo e Marília não está entre eles (0 de 2.235 feições). O OpenStreetMap tem 6 polígonos de bairro para os 78 bairros do projeto. A Prefeitura não publica camada georreferenciada de bairros nem perímetro urbano. O único shapefile de bairros que encontrei é pago e de licença não declarada.

Por isso a recomendação é não procurar o polígono pronto, e sim construir limites que sigam a cidade real, mantendo os pontos de bairro que o projeto já tem:

1. Contorno urbano: união dos polígonos `landuse` do OSM (residencial, comercial, varejo, industrial) mais parques e equipamentos, no lugar do casco convexo atual. Alternativa mais autoritativa: "Áreas urbanizadas do Brasil 2022" do IBGE (conferir o tamanho do arquivo antes).
2. Divisas entre bairros: em vez de Voronoi por distância em linha reta, atribuir cada trecho de rua e cada quarteirão ao ponto de bairro mais próximo pela rede viária, cortando nos obstáculos reais (rio do Peixe, córregos, linha férrea, rodovias). As divisas passam a seguir ruas e córregos.
3. Complemento opcional: setores censitários 2022 do IBGE como unidades de montagem. Cada setor é um conjunto de quarteirões com borda em ruas. Atribuir cada setor ao ponto de bairro mais próximo e dissolver dá polígonos orgânicos. O arquivo do estado inteiro tem 174 MB, então o script teria de baixar e filtrar por `CD_MUN = 3529005`. Não baixei, portanto não verifiquei se Marília está nele nem quantos setores tem.
4. Os 6 polígonos reais do OSM (Lácio, Padre Nóbrega, Jardim Julieta, Oswaldo Fanceli, Jardim Vitória, Jardim Vista Alegre) entram como estão e os demais bairros se ajustam ao redor.

Fallback: se o passo 2 ou 3 ficar caro, manter o Voronoi, mas recortado pelo contorno urbano real do passo 1 e por barreiras (rio, linha férrea). Já elimina a maior parte do aspecto de recorte geométrico nas bordas. Para a versão oficial, a via é um pedido pela Lei de Acesso à Informação à Secretaria de Planejamento Urbano pedindo o abairramento georreferenciado do Plano Diretor.

## IBGE, malha de bairros do Censo 2022

URL: `https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/malha_com_atributos/bairros/gpkg/UF/SP/SP_bairros_CD2022.gpkg` (8,5 MB, GeoPackage, tabela `SP_bairros_CD2022`, campos `CD_MUN`, `NM_BAIRRO`, `AREA_KM2`).

Baixei o arquivo e consultei com `sqlite3`: 2.235 bairros em 58 municípios, 0 em Marília (`CD_MUN = '3529005'`). Os municípios com mais bairros são Embu das Artes (115), Santo André (113), Catanduva (108). O IBGE só tem bairro onde a prefeitura entregou delimitação ao Censo. Conclusão: inútil para Marília.

Licença: dados do IBGE são públicos; citar "Fonte: IBGE" basta. Não encontrei termos mais restritivos.

## IBGE, setores censitários e municípios

Setores: `.../malha_com_atributos/setores/gpkg/UF/SP/SP_setores_CD2022.gpkg`, 174 MB (também em `shp` e `csv`). Passa do limite que me dei para baixar, então não inspecionei. Em geral os setores seguem eixos de rua e são o melhor bloco de montagem aberto, mas o número de setores urbanos de Marília e a presença de `NM_BAIRRO` preenchido precisam ser conferidos. A API de malhas (`servicodados.ibge.gov.br/api/v3/malhas`) não entrega setor para município: respondeu 400 ("intrarregiao NÃO aceita valores"). Marília não tem subdistritos na API de localidades (retorno vazio).

Município: `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/3529005?formato=application/vnd.geo+json&qualidade=maxima` devolve um polígono de 849 vértices, 18 KB, limites -50,150 a -49,768 de longitude e -22,499 a -21,875 de latitude. Serve como contorno municipal (zona rural incluída), não como mancha urbana.

Outros conjuntos do IBGE que existem e não testei: áreas urbanizadas (`geoftp.ibge.gov.br/organizacao_do_territorio/tipologias_do_territorio/areas_urbanizadas_do_brasil/`, pastas 2005, 2015, 2019, 2022) e favelas e comunidades urbanas do Censo 2022 (`.../Favelas_e_comunidades_urbanas_Resultados_do_universo/arquivos_vetoriais/`).

## OpenStreetMap via Overpass

Consultas feitas contra `https://overpass-api.de/api/interpreter` com a área `["name"="Marília"]["admin_level"="8"]` (relação 298306, `IBGE:GEOCODIGO=3529005`).

Bairros e divisões:

- `place=suburb|neighbourhood|quarter`: 90 elementos, quase todos pontos (55 suburb, 20 neighbourhood, 13 quarter) e só 2 polígonos (`way`): Jardim Vitória e Jardim Vista Alegre. É a origem dos 78 bairros do projeto, então a cobertura de nomes é de 100% por construção.
- `boundary=administrative` nível 9: Amadeu Amaral, Avencas, Dirceu, Lácio, Padre Nóbrega, Rosália e a sede Marília (relação 5683164). São distritos, não bairros. Nível 10: Vila Parque das Nações, Vila Santa Antonieta, Jardim Julieta, Oswaldo Fanceli. Dos 78 bairros do projeto, 4 casam com um polígono administrativo (Lácio, Padre Nóbrega, Jardim Julieta, Oswaldo Fanceli), mais os 2 `way` acima: 6 de 78, cerca de 8%.
- `landuse=residential`: 54 polígonos, 45 com nome, e nenhum nome coincide com os bairros do projeto. São condomínios e loteamentos fechados (Village Damha, Recanto das Esmeraldas, Reserva do Palmital). Úteis como forma de área urbana, não como bairro.

Uso do solo e natureza (contagens de elementos):

- `landuse` residential 54, retail 38, industrial 22, commercial 3.
- Parques (`leisure=park`) 107, jardins 15, estádios 3, bosques (`natural=wood`) 99, gramados 377, cemitérios 4, áreas de recreação 6.
- Água: polígonos `natural=water` 76, rios 11, córregos (`waterway=stream`) 347, áreas úmidas 21. Rios e córregos com nome incluem Rio do Peixe, Rio Tibiriçá, Córrego do Barbosa, Córrego do Pombo, Córrego Água do Norte, Córrego Santana, Córrego Jatobá, Represa do Norte.
- Ferrovia: existe (por exemplo "Ramal Itirapina-Pa...", Tronco Oeste Paulista, Fepasa, bitola 1600). Minha consulta de contagem de `railway=rail` saiu vazia por limite de requisição, então conte de novo antes de usar.
- Rodovias com `ref`: 179 trechos de `trunk` e `motorway`. Refs: SP-333 (Rodovia Rachid Rayes, Dona Leonor Mendes de Barros, Transbrasiliana), SP-294 (Comandante João Ribeiro de Barros) e BR-153 (trechos sobrepostos a ambas).

Qualidade: razoável para água, parques e áreas verdes, boa para a rede viária, fraca para limites de bairro.

Formato e reprodução: JSON do Overpass, `out geom` devolve geometria completa. As consultas completas pesam de dezenas a algumas centenas de KB (landuse 24 KB e parques/água 167 KB só com tags e centro). O servidor devolveu 502 "Gateway" quando mandei quatro consultas em paralelo, então o script deve serializar e usar a lógica de repetição que `scripts/overpass.ts` já tem. A busca pela relação do município deve usar o `id` (298306) em vez do nome, mais estável.

Licença: ODbL. Exige atribuição "© colaboradores do OpenStreetMap" visível e, para base derivada distribuída, manter a mesma licença (compartilhamento pela mesma licença). O projeto já declara ODbL no README e no campo `source` do `data/marilia.json`.

## Prefeitura de Marília

- Dados abertos (`/portal/dados-abertos`): só JSON de contas públicas, licitações, legislação e similares. Nenhuma camada geográfica listada e nenhuma licença de dados declarada (rodapé de "todos os direitos reservados" do fornecedor do site).
- "Dados de Marília" lista sete distritos (Amadeu Amaral, Avencas, Dirceu, Lácio, Padre Nóbrega, Rosália e Fazenda do Estado), sem mapas.
- Plano Diretor (Lei Complementar 480/2006): `https://www.marilia.sp.gov.br/prefeitura/downloads/legislacao-municipal/plano_diretor.pdf`. O art. 38 define o abairramento (fusão de loteamentos em bairros, regiões e zonas) e o Anexo 3 lista bairros e loteamentos por zona. É texto e mapa em PDF, sem vetor. Serve para validar nomes e agrupamentos, não para geometria.
- Perímetro urbano: segundo um blog local (Blog do Rodrigo, não oficial), o perímetro georreferenciado previsto no Plano Diretor não foi regulamentado e a Prefeitura não informa qual é o perímetro vigente. Tratar como indício.
- Não achei GeoServer, WMS ou WFS da Prefeitura.
- Há contrato (CST 1753/2024) com a Intermapas Geotecnologia para atualizar o cadastro imobiliário, que pode gerar uma base oficial no futuro.
- Mapas de zoneamento existem como anexos em PDF/imagem (por exemplo no e-SIC da Câmara), sem camada vetorial.

## Gismaps, "Bairros de Marília (SHP)"

Produto pago, R$ 85, atualizado em 11/03/2020, fonte declarada Prefeitura de Marília, atributos ID, NOME1, NOME2, NOME3. A página não traz licença nem número de bairros. É o único vetor de bairros que achei, mas é pago e não pode ser redistribuído no repositório sem autorização. Descartar, ou comprar apenas para uso interno como gabarito de conferência (decisão do dono, e a base derivada não deve ir para o repositório).

## Estado de São Paulo (DataGeo, IGC)

O DataGeo (`datageo.ambiente.sp.gov.br`) hospeda "limite municipal SP (IGC)", que é só o contorno do município. A única camada com divisões internas que encontrei é a dos distritos da capital. Não achei camada de bairros de Marília. O endereço de capacidades do serviço (`datageo.ambiente.sp.gov.br/datageo/ows?SERVICE=WFS&REQUEST=GetCapabilities`) veio de uma busca e não foi consultado por mim. Valor para o projeto: baixo, redundante com o contorno do IBGE.

## Outras fontes

Geoaplicada e Forest-GIS redistribuem a malha de bairros do IBGE, com a mesma lacuna. Um fórum de QGIS (qgisbrasil) cita anexos de abairramento de Marília em RAR, não verificados e de procedência incerta, e o recorte dos setores de 2010 por nome de bairro. Não usar arquivos de procedência incerta.

## Outros toques de realismo

Disponíveis no OSM (contagens desta consulta):

- Contorno municipal: IBGE (18 KB) ou relação 298306 do OSM.
- Mancha urbana: união dos `landuse` urbanos, ou áreas urbanizadas do IBGE.
- Rios, córregos e represas: Rio do Peixe, Tibiriçá, Represa do Norte, e 76 polígonos de água. Desenhar sob as ruas, em azul-acinzentado discreto para respeitar a linguagem de sinalização do projeto.
- Parques e bosques: Parque do Povo, Bosque Municipal Rangel Pietraroia, e 107 parques no total. Filtrar por área mínima para não poluir.
- Ferrovia: Tronco Oeste Paulista, desenhada como linha tracejada.
- Rodovias com rótulo: SP-333, SP-294, BR-153. Usar o campo `ref` para escudos pequenos.
- Avenidas principais: vêm do `build-roads.ts` (`highway=trunk|primary|secondary`), rotular as de maior hierarquia.
- Marcos: Terminal Urbano de Marília (`bus_station`, 3 elementos, a rodoviária intermunicipal precisa de conferência), Santa Casa de Misericórdia, Hospital Unimar, Complexo Ambulatorial Bento de Abreu Sampaio Vidal, PA Sul, Unimed Pronto Atendimento (9 hospitais no total), UNESP (universidade com nome truncado na minha listagem: "Universidade Estadual Paulista Jú..."), FAIP-FAEF, FATEC, Senai, Sebrae, Marília Shopping, Esmeralda Shopping, Galeria San Remo, Estádio Bento de Abreu Sampaio Vidal, Museu de Paleontologia, Chaminé da Matarazzo, Aeroporto Estadual de Marília (pista e táxi inclusos), Cemitério da Saudade, Marília Country Club.

O `build-geo.ts` já busca shop (supermercado e shopping), amenity (escola, hospital, universidade, rodoviária, posto, banco) e leisure (parque, estádio) e guarda 130 pontos de referência. Faltam aeroporto, museu, atração e faculdade (`college`).

## Plano para scripts/build-geo.ts

Situação atual: Overpass para pontos de `place`, ruas e POIs; Voronoi de `src/shared/geo.ts` recortado por um casco convexo das ruas ampliado em 3%; CEPs pelo ViaCEP. O arquivo gerado é `data/marilia.json` (93 KB, 78 bairros, 400 ruas com CEP, 130 POIs).

Passos:

1. Buscar por id da relação, não pelo nome: `rel(298306);map_to_area->.a;`. Manter o `BBOX` atual como filtro.
2. Novas consultas (uma de cada vez, com a espera já existente em `scripts/overpass.ts`, e com `out geom`):
   - `way(area.a)["landuse"~"^(residential|commercial|retail|industrial)$"]; rel(area.a)["landuse"~"^(residential|commercial|retail|industrial)$"];`
   - `nwr(area.a)["leisure"~"^(park|garden)$"]; nwr(area.a)["natural"~"^(wood|water)$"]; way(area.a)["waterway"~"^(river|stream)$"];`
   - `way(area.a)["railway"="rail"];`
   - `way(area.a)["highway"~"^(trunk|motorway)$"]["ref"];`
   - polígonos de bairro e distrito: `nwr(area.a)["place"~"^(suburb|neighbourhood|quarter)$"]; rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10)$"];`
3. Montar geometrias de relações multipolígono (juntar `outer` e `inner` por nós compartilhados). Hoje não há dependência para isso. Avaliar entre escrever o junta-anéis à mão (cerca de 60 linhas) ou usar `osmtogeojson`; uma dependência nova precisa de justificativa e versão estável conferida na hora.
4. Contorno urbano: união dos polígonos urbanos. Sem biblioteca de geometria, usar rasterização numa grade (por exemplo células de 25 m) e extrair o contorno, o que evita adicionar dependência. Alternativa: `polygon-clipping` (conferir versão e licença).
5. Divisas: calcular, para cada célula da grade dentro do contorno, o bairro dono por distância na rede viária (Dijkstra multi-fonte a partir do nó de rua mais próximo de cada ponto de bairro), com arestas de rio, córrego e ferrovia como barreiras sem passagem exceto em pontes. Células dentro de um polígono real do OSM (os 6) ficam com o bairro desse polígono. Vetorizar cada região conexa por contorno da grade e suavizar com o `roundPolygon` existente ou com Chaikin. Células órfãs (sem rua alcançável) vão para o bairro mais próximo em linha reta.
6. Se optar pelos setores censitários: baixar o GeoPackage para `data/.cache/` (gitignored), ler com `node:sqlite`, decodificar o cabeçalho GeoPackage e o WKB (cerca de 40 linhas) e filtrar por `CD_MUN='3529005'`, usando a tabela `rtree_SP_setores_CD2022_geom` para não varrer o arquivo todo. Atribuir cada setor ao bairro pelo centroide e dissolver. Só vale se o passo 5 sair feio, porque o download é de 174 MB.
7. Nomes: o `id` já vem de `slugify(name sem "Núcleo|Conjunto Habitacional")`. Para casar com polígonos do OSM, comparar a forma normalizada de `findNeighborhoodByName` (`normalizeName` em `src/server/city.ts`) após remover prefixos genéricos (Jardim, Parque, Vila, Residencial, Núcleo Habitacional, Conjunto Habitacional). Por esse critério casam hoje Lácio, Padre Nóbrega, Julieta, Oswaldo Fanceli, Vitória e Vista Alegre. Nomes de distrito (Amadeu Amaral, Avencas, Dirceu, Rosália) não são bairros do projeto e ficam de fora. Registrar no log os bairros sem polígono, em vez de falhar.
8. Saída: acrescentar ao `data/marilia.json` as camadas `water`, `parks`, `rail`, `highways` e `landmarks` simplificadas (Douglas-Peucker, tolerância de 5 a 10 m) e arredondadas a 5 casas decimais (cerca de 1 m). Orçamento sugerido: menos de 400 KB no total, porque o arquivo é importado em tempo de build pelo servidor (`src/server/city.ts`) e servido ao navegador. Atualizar o tipo `CityDataset` e remover o Voronoi e o casco convexo se deixarem de ser usados (substituir, não manter os dois).
9. Testes: o cálculo de dono por rede e a montagem de multipolígonos são funções puras e devem ter testes com casos pequenos (rio separando dois bairros, bairro sem rua, anel com buraco).

Atribuição:

- README, seção Dados: trocar a frase "células de Voronoi" pela nova descrição e manter ODbL e ViaCEP. Se usar IBGE, acrescentar "contorno municipal e setores: IBGE (Censo 2022)".
- Interface: texto de atribuição fixo no canto do mapa, "© colaboradores do OpenStreetMap" com link para `https://www.openstreetmap.org/copyright`, e "IBGE" se a camada for usada. O MapLibre tem o campo `attribution` nas fontes; conferir se o mapa atual já mostra algo.
- Campo `source` do `data/marilia.json` listando as fontes usadas.

## Riscos

- Dependência da rede viária do OSM: quarteirões sem rua mapeada geram regiões vazias. Mitigação: fallback pela distância em linha reta.
- Limites inventados: as divisas calculadas não são os limites legais dos bairros. A interface e o README devem dizer que os limites são aproximados (já dizem para o Voronoi), para ninguém tratá-los como oficiais.
- Desalinhamento de dados: as ocorrências geradas e a função `nearestNeighborhood` usam distância ao ponto do bairro; passar a usar o polígono muda a atribuição de ocorrências existentes e pode quebrar testes e o histórico do `data/fogo.db`. Decidir se a atribuição passa a ser por ponto em polígono.
- Overpass: instabilidade e limite de requisições (502 observado), resultado muda com edições do OSM; gravar o JSON gerado no repositório (como hoje) mantém a aplicação reproduzível, mas refazer o script em outra data dá resultado diferente.
- Tamanho: parques, gramados (377) e córregos (347) em excesso aumentam o JSON e poluem o mapa; filtrar por área e nome.
- Licença ODbL: a base derivada distribuída precisa manter a atribuição e o compartilhamento pela mesma licença; vale conferir se isso é aceitável para o uso do dono antes de publicar o `data/marilia.json`.
- Setores IBGE: arquivo de 174 MB, não inspecionado; presença de Marília e qualidade não confirmadas.
- Gismaps e arquivos de fórum: licença desconhecida, não usar no repositório.
- Reprodutibilidade do `pnpm geo`: já leva cerca de quatro minutos por causa do ViaCEP; as novas consultas acrescentam algumas dezenas de segundos de Overpass e processamento de grade.
