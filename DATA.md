# Dados e créditos

O código do FOGO usa a licença MIT (arquivo `LICENSE`). Os dados de terceiros têm licenças próprias, listadas aqui.

## OpenStreetMap

Bairros, ruas, malha viária, rios, córregos, ferrovia e pontos de referência de Marília vêm do OpenStreetMap, © colaboradores do OpenStreetMap, sob a Open Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright.

Os arquivos derivados `data/marilia.json` e `data/marilia-roads.json` continuam sob a ODbL. Quem redistribuir esses arquivos precisa manter este crédito e a mesma licença. Eles alimentam só a cidade da simulação.

Ao cadastrar uma cidade nova, o FOGO busca o limite do município no Nominatim (https://nominatim.openstreetmap.org), também com dados do OpenStreetMap sob a ODbL. O limite fica gravado no banco daquela cidade.

Os limites de bairro saem do script `pnpm boundaries`, calculados a partir desses dados. São aproximados e não valem como divisa oficial.

## Mapa de fundo

OpenFreeMap (https://openfreemap.org), com dados do OpenMapTiles e do OpenStreetMap. O crédito aparece no canto do mapa.

## ViaCEP

Os CEPs das ruas foram conferidos no ViaCEP (https://viacep.com.br). O botão "Buscar CEP" do formulário também consulta o serviço.

## IBGE

A lista de municípios por UF, usada no cadastro de cidades, vem da API de localidades do IBGE (https://servicodados.ibge.gov.br/api/docs/localidades), de uso público.

## Fontes

Atkinson Hyperlegible Next e Barlow Semi Condensed, sob a SIL Open Font License, distribuídas pelos pacotes `@fontsource`.

## Dados simulados

Na simulação, equipamentos, agentes, ocorrências e telemetria são gerados pelo próprio sistema. Não são dados reais da prefeitura de Marília.
