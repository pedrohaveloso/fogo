---
name: new-equipment-type
description: Passo a passo para acrescentar um tipo de equipamento ao FOGO (catálogo, ícone, semente, simulação e testes). Use quando pedirem um tipo novo de equipamento.
---

# Novo tipo de equipamento

1. Acrescente o tipo em `EQUIPMENT_TYPES` de `src/shared/catalog.ts`, com rótulo, intervalo de manutenção, telemetria e os campos próprios. O formulário e a validação do servidor derivam daqui.
2. Rode `pnpm typecheck`. Os registros por tipo são `Record<EquipmentType, ...>`, então o compilador aponta cada lugar que falta preencher. Hoje são:
   - `TYPE_GLYPHS` em `src/web/icons.tsx` (ícone do marcador e da lista);
   - `PLAN` e `TYPE_AGENCY` em `src/server/seed/inventory.ts` (quantidade, onde posicionar e o órgão da semente; em produção o órgão vem do cadastro de cada cidade);
   - marcas e modelos e `SERIAL_PREFIX` em `src/server/seed/texts.ts`;
   - `FAILURE_RATE_PER_DAY` em `src/server/patterns.ts`.
3. Se o tipo se move (veículo, patinete), confira o tratamento de deslocamento em `src/server/simulator.ts` e a velocidade documentada no README.
4. Teste a validação do tipo novo em `src/server/validation.test.ts` e o cadastro pela API em `src/server/app.test.ts`, inclusive campo obrigatório ausente.
5. Recrie o banco com `pnpm start:fresh`, confira no Chrome o marcador, a legenda, o filtro, a lista e o formulário, e atualize a contagem de tipos no README.
