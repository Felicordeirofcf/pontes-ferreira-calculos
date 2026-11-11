# Como colocar tudo no ar

| Parte | Custo | Tempo |
|---|---|---|
| 1–4. Banco, login, site e painel | grátis | ~30 min |
| 5. WhatsApp dentro do painel | grátis para responder clientes* | ~1 h + aprovação da Meta (1 a 3 dias) |

\* Responder em até 24h depois da última mensagem do cliente não tem custo. Só os **modelos** enviados para retomar conversas paradas são cobrados pela Meta (centavos por mensagem).

Hoje o painel roda em **modo demonstração**, com dados de exemplo salvos só no navegador.

---

## 1. Criar o banco (Supabase)
1. Crie uma conta em **supabase.com** e clique em **New project**. Nome: `pontes-ferreira`. Região: **South America (São Paulo)**.
2. Abra **SQL Editor > New query** e cole todo o conteúdo de `supabase/schema.sql`.
   - O login autorizado já está configurado: **adm@pontesferreiracalculos.com**.
   - Clique em **Run**. A mensagem deve ser "Success".

## 2. Criar seu login
1. **Authentication > Users > Add user > Create new user**, com o e-mail **adm@pontesferreiracalculos.com**. Marque **Auto Confirm User**.
2. **Authentication > Sign In / Providers**: **desligue "Allow new users to sign up"**.

## 3. Ligar site e painel ao banco
Em **Project Settings > API**, copie a **Project URL** e a chave **anon public** e cole em `site/config.js`.

## 4. Publicar (Netlify)
1. Em **netlify.com**, vá em **Add new site > Deploy manually** e arraste a **pasta `site`**.
2. O site fica em `https://seu-site.netlify.app/` e o painel em `/painel/`.
3. Em **Domain settings**, ligue o seu domínio.

---

## 5. WhatsApp dentro do painel (API oficial da Meta)

**Antes de começar, sobre o número:**
- Se o (21) 98770-8652 está no **WhatsApp Business** (app), dá para conectar mantendo o app no celular (recurso de *coexistência*: as mensagens aparecem nos dois lugares).
- Se está no WhatsApp comum, migre antes para o WhatsApp Business, ou use outro número só para o painel.
- **Não use APIs "não oficiais"** (que leem QR code): o número pode ser banido.

### 5.1 Criar o app na Meta
1. Em **business.facebook.com**, crie ou use o seu Business Manager, com o CNPJ da empresa.
2. Em **developers.facebook.com > Meus apps > Criar app**, escolha o tipo **Empresa** e adicione o produto **WhatsApp**.
3. Em **WhatsApp > Configuração da API**, adicione o seu número e confirme pelo código SMS. Anote o **Phone number ID**.
4. Em **Business Manager > Usuários do sistema**, crie um usuário Administrador e gere um **token permanente** com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
5. Em **Configurações do app > Básico**, copie a **Chave secreta do app** (App secret).

### 5.2 Criar as duas funções no Supabase
Em **Edge Functions > Deploy a new function > Via Editor**:
1. Função **`whatsapp-webhook`**: cole o conteúdo de `supabase/functions/whatsapp-webhook/index.ts`.
   Depois, nas configurações da função, **desligue "Enforce JWT verification"**.
2. Função **`whatsapp-enviar`**: cole o conteúdo de `supabase/functions/whatsapp-enviar/index.ts`. Deixe o JWT **ligado**.
3. Em **Edge Functions > Secrets**, crie:
   | Nome | Valor |
   |---|---|
   | `WA_TOKEN` | token permanente (5.1, passo 4) |
   | `WA_PHONE_NUMBER_ID` | Phone number ID (5.1, passo 3) |
   | `WA_APP_SECRET` | App secret (5.1, passo 5) |
   | `WA_VERIFY_TOKEN` | uma senha que você inventa, ex.: `pontes-ferreira-2026` |

### 5.3 Ligar o webhook na Meta
1. No app da Meta, vá em **WhatsApp > Configuração > Webhook > Editar**.
2. **URL de callback**: `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook`
3. **Token de verificação**: o mesmo `WA_VERIFY_TOKEN`.
4. Clique em **Verificar e salvar** e assine o campo **messages**.

### 5.4 Criar o modelo para retomar conversas
Em **WhatsApp Manager > Modelos de mensagem > Criar modelo**:
- Nome: `retomar_contato` · Categoria: **Utilidade** · Idioma: **Português (BR)**
- Texto sugerido: *"Olá! Aqui é da Pontes Ferreira Cálculos Judiciais. Estamos à disposição para dar andamento ao seu cálculo. Pode responder esta mensagem para continuarmos."*

A aprovação costuma sair em minutos ou em até 24h.

### 5.5 Ativar no painel
Em `site/config.js`, mude `WA_ATIVO: false` para `WA_ATIVO: true` e publique de novo no Netlify.

---

## Como o fluxo funciona
| Etapa | Onde |
|---|---|
| Advogado envia PDF (até 50 MB) ou nº do processo no site | entra em **Leads > Novo**, com som e notificação |
| Advogado manda mensagem no WhatsApp | aparece na tela **WhatsApp**. Se for um número novo, vira lead no CRM. PDF enviado por ele fica salvo e vinculado ao lead |
| Você responde | pela tela **WhatsApp**, com **respostas rápidas** (saudação, pedir PDF, orçamento, entrega, cobrança) |
| Acompanhamento | **ficha do lead**: temperatura, próximo contato, histórico de ligações e anotações. A aba **Retornos** mostra o que fazer hoje |
| Fechou | **→ Cálculo** cria o cliente e o cálculo |
| Terminou no PJe-Calc | **Importar .PJC** marca como entregue. Pelo 📎 no WhatsApp você manda o relatório e o .PJC para o cliente |
| Recebeu | **Marcar pago**. Em Financeiro, **Cobrar** abre a mensagem de cobrança |

## Testar no computador
```
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Depois abra http://localhost:8765/painel/
