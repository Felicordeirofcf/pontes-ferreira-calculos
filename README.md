# Pontes Ferreira Cálculos Judiciais

Site de captação + painel de gestão (CRM, WhatsApp, cálculos, financeiro).

| Pasta | O que é | Onde roda |
|---|---|---|
| `site/` | Página de captação (`/`) e painel (`/painel/`) | Vercel (Root Directory = `site`) |
| `site/config.js` | Chaves públicas do Supabase e opções do WhatsApp | — |
| `supabase/schema.sql` | Tabelas, regras de segurança e armazenamento | Supabase > SQL Editor |
| `supabase/functions/` | Funções do WhatsApp (API oficial da Meta) | Supabase > Edge Functions |
| `serve.ps1` | Servidor local para testes (`http://localhost:8765`) | Seu computador |

Passo a passo de ativação: [COMO_ATIVAR.md](COMO_ATIVAR.md).

> Arquivos de cálculo (`.PJC`) e relatórios de processos ficam **fora** do repositório (`.gitignore`).
