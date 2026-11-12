# Pontes Ferreira Cálculos Judiciais

Site de captação + painel de gestão (CRM, WhatsApp, cálculos, financeiro).

| Pasta | O que é | Onde roda |
|---|---|---|
| `site/` | Página de captação (`/`) e painel (`/painel/`) | Vercel (Root Directory = `site`) |
| `site/config.js` | Chaves públicas do Supabase e opções do WhatsApp | — |
| `supabase/schema.sql` | Tabelas, regras de segurança e armazenamento | Supabase > SQL Editor |
| `supabase/functions/` | Aviso por e-mail de pedido novo (`aviso-lead`) e funções do WhatsApp | Supabase > Edge Functions |
| `servidor/instalar.sh` | Manter o Supabase ativo + backup diário do banco | Locaweb Cloud (Ubuntu 24.04) |
| `scripts/gerar-paginas.py` | Gera as páginas para o Google (serviços, cidades, TRTs) e o sitemap | `python3 scripts/gerar-paginas.py` |
| `servidor/instalar-evolution.sh` | Evolution API (WhatsApp Web) + https, para o WhatsApp do painel | Locaweb Cloud |
| `site/img/marca.svg` · `site/marca.css` | Emblema e identidade visual (azul-marinho + dourado) | Site e painel |
| `serve.ps1` | Servidor local para testes (`http://localhost:8765`) | Seu computador |

Passo a passo de ativação: [COMO_ATIVAR.md](COMO_ATIVAR.md).

> Arquivos de cálculo (`.PJC`) e relatórios de processos ficam **fora** do repositório (`.gitignore`).
