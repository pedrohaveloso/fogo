---
paths:
  - "src/server/predictions/**"
---

# Previsões

- Um arquivo por modelo, como funções puras que recebem os dados do banco e devolvem o resultado. O acesso ao banco fica em `service.ts`.
- Nenhum modelo importa nada de `src/server/seed`. Eles precisam descobrir os padrões sozinhos.
- As taxas do simulador ao vivo são aceleradas por `FOGO_LIVE_MULTIPLIER`; desconte isso ao misturar histórico e dados ao vivo.
- Dias ou horas sem simulação (servidor desligado) não contam como zero. Use as horas registradas de cobertura.
- Testes usam dados sintéticos montados no próprio teste, cobrindo série vazia, lacunas e mudança real.
- A interface precisa dizer o que é previsto, com quais dados e como usar na decisão. Quando um modelo mudar, atualize esses textos e o README.
