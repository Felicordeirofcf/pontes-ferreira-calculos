---
name: site-captacao-pontes-ferreira
description: "Landing page + estratégia de Ads do serviço de cálculos trabalhistas \"Pontes Ferreira Cálculos Judiciais\" (site/ no projeto)"
metadata:
  node_type: memory
  type: project
  originSessionId: 57681733-9870-48de-9774-136195228d3e
  modified: 2026-11-11T16:50:21.161Z
---

Site de captação em `site/index.html` e estratégia em `site/ESTRATEGIA_ADS.md` (criados em 2026-11-11).
Marca: Pontes Ferreira Cálculos Judiciais · CNPJ 51.362.258/0001-79 · WhatsApp (21) 98770-8652. Público: advogados trabalhistas (B2B).
Preço: a partir de R$ 150 por cálculo de 1 autor; mais de um autor ou caso complexo = sob consulta no WhatsApp.
Cliente envia PDF ou só o nº do processo (a equipe puxa no PJe).

Painel de gestão (uso individual, online) em `site/painel/` com CRM (ficha, retornos, histórico) e tela de WhatsApp via API oficial da Meta (Edge Functions em `supabase/functions/`, schema em `supabase/schema.sql`, guia em `COMO_ATIVAR.md`), Supabase + Netlify; `site/config.js` vazio = modo demonstração. Preview local: `serve.ps1` (porta 8765, launch.json "site-e-painel").

**Why:** o CNPJ apareceu vinculado ao nome "Pontes & Silva Cálculos Judiciais" (domínio pscalculos.com.br); o nome no Google/Meta Ads precisa bater com o cadastro.
**How to apply:** ainda faltam IDs do GA4, Google Ads e Meta Pixel, e a escolha de domínio/hospedagem (formulário preparado para Netlify Forms, limite 8 MB por anexo).
