---
paths:
  - "src/web/**"
---

# Interface

- O usuário principal da Central é um gestor no notebook que abre o sistema algumas vezes por dia. Pouca informação, bem hierarquizada; o que pede ação vem primeiro.
- Estado normal fica em cinza neutro. Cor forte só para problema, e nunca sozinha: forma, padrão (zebrado, tracejado) ou texto acompanham a cor.
- Seleção é branca, porque o amarelo já significa atenção e foco de teclado.
- Status novos reaproveitam `HealthSwatch`, `RiskSwatch`, `.plate` e `Meter` de `components/badges.tsx` e os tokens de `styles.css`. Não crie cor de status.
- Visibilidade se alterna com `hidden`, não com `style.display`.
- Textos em português passam pela skill `humanizer`. Plural por extenso com o helper de `src/shared/text.ts`, nunca "(s)".
- Acessibilidade: contraste AA, foco visível, controles por teclado (abas respondem às setas), `aria-live` só para o que muda e importa.
- Toda tela é conferida no desktop e em 400px.
