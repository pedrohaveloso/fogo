---
paths:
  - "src/web/**"
---

# Interface

- O usuário principal da Central é um gestor no notebook que abre o sistema algumas vezes por dia. Pouca informação, bem hierarquizada; o que pede ação vem primeiro.
- Estado normal fica em cinza neutro. Cor forte só para problema, e nunca sozinha: forma, padrão (zebrado, tracejado) ou texto acompanham a cor.
- O painel usa tema claro. Seleção usa a tinta escura (`--selected` no CSS, `MAP_INK` no mapa), porque o amarelo já significa atenção e foco de teclado. Cores de mapa ficam em `src/web/map/palette.ts`.
- Arredondamento: `--radius` em todo componente e `--radius-mark` só em marcas de dado pequenas (amostras, medidores, células de gráfico). Círculos ficam em 50%.
- Telas fora da Central usam a largura única de `.page`. Listas longas paginam com `components/Pagination.tsx`: 50 por página por padrão, com escolha de 10, 25, 100 ou todos (lembrada por lista no navegador) e seleção direta da página. Linhas de lista terminam com o ícone de editar.
- Status novos reaproveitam `HealthSwatch`, `RiskSwatch`, `.plate` e `Meter` de `components/badges.tsx` e os tokens de `styles.css`. Não crie cor de status.
- Visibilidade se alterna com `hidden`, não com `style.display`.
- Textos em português passam pela skill `humanizer`. Plural por extenso com o helper de `src/shared/text.ts`, nunca "(s)".
- Acessibilidade: contraste AA, foco visível, controles por teclado (abas respondem às setas), `aria-live` só para o que muda e importa.
- Toda tela é conferida no desktop e em 400px.
