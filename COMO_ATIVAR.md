# Como colocar tudo no ar

| Parte | Custo | Tempo |
|---|---|---|
| 1–4. Banco, login, site e painel | grátis | ~30 min |
| 4.2 Tráfego pago (Google e Meta) | só a verba dos anúncios | ~1 h |
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

## 4. Publicação (Vercel) ✅ já feito
O site está na Vercel, ligado ao GitHub (pasta `site`), no domínio **pontesferreiracalculos.com**. Cada alteração enviada ao GitHub publica sozinha. Painel: **pontesferreiracalculos.com/painel/**.

## 4.1 Primeiro login
Entre com **adm@pontesferreiracalculos.com** e a senha temporária criada no passo 2. O painel pede para trocar a senha na hora. Depois, use **Trocar senha** no rodapé do menu sempre que quiser.

## 4.1.1 Aviso por e-mail a cada pedido
1. Supabase > Edge Functions > Deploy a new function > Via Editor: nome **`aviso-lead`**, cole `supabase/functions/aviso-lead/index.ts`. **Desligue "Enforce JWT verification"**.
2. Edge Functions > Secrets: `SMTP_USER` = adm@pontesferreiracalculos.com · `SMTP_PASS` = senha dessa caixa de e-mail (Locaweb).
3. Rode o `schema.sql` de novo: ele cria o gatilho que chama a função a cada pedido.
4. Teste: faça um pedido pelo site; o e-mail chega em 1 minuto, com link para responder no WhatsApp e o PDF.

## 4.1.2 Painel do cliente, agenda e e-mails automáticos
1. Rode o `schema.sql` de novo (cria o link do cliente, os arquivos de entrega e o agendamento dos e-mails).
2. Supabase > Edge Functions: crie **`portal-cliente`** e **`alertas`** (as duas com **"Enforce JWT verification" desligado**). Elas usam os mesmos secrets SMTP do aviso de pedidos.
3. Painel > Configurações > Ajustes > **E-mails automáticos** > "Enviar teste" para conferir.
4. Clientes > **🔗 Portal**: gera o link pessoal do cliente e envia pelo WhatsApp. Cálculos > **📎**: anexe o .PJC e o relatório para o cliente baixar.

## 4.2 Tráfego pago
Painel > **Tráfego pago** > **1. Ativação**: siga os 8 passos (contas, códigos, ligar no site, testar, metas e campanhas). As campanhas prontas para copiar ficam na aba **3**.
> Se você rodou o `schema.sql` antes desta área existir, rode o arquivo de novo (é seguro rodar mais de uma vez) para criar a tabela `ajustes`.

---

## 5-A. WhatsApp pela Evolution API (escolhido em 12/11/2026)
O número conecta como "WhatsApp Web" no servidor da Locaweb Cloud. **O app do celular continua funcionando.**
> Risco: a Evolution não é oficial. Use para atender quem te procura e para abordagens 1 a 1; evite disparo em massa.

1. **Locaweb (DNS):** registro A `wa` → IP público do servidor (191.252.230.161).
2. **Locaweb Cloud (rede):** encaminhar e liberar as portas **80** e **443** do IP público para a máquina `pontes-ferreira-srv`.
3. **Servidor (console "Acessar VM", como root):**
   ```
   curl -fsSL https://raw.githubusercontent.com/Felicordeirofcf/pontes-ferreira-calculos/main/servidor/instalar-evolution.sh -o instalar-evolution.sh
   bash instalar-evolution.sh
   ```
   No fim ele mostra `EVOLUTION_URL` e `EVOLUTION_KEY`.
4. **Supabase > Edge Functions:**
   - atualize `whatsapp-webhook` (JWT **desligado**) e `whatsapp-enviar` (JWT ligado) com o código do GitHub;
   - crie `whatsapp-conexao` (JWT **ligado**) com `supabase/functions/whatsapp-conexao/index.ts`;
   - Secrets: `EVOLUTION_URL`, `EVOLUTION_KEY` e `EVOLUTION_WEBHOOK_KEY` (uma senha inventada por você).
5. **Painel > WhatsApp > Conectar WhatsApp:** escaneie o QR code com o celular (WhatsApp Business > Aparelhos conectados > Conectar um aparelho).

**Regra do CRM (número também usado para assuntos pessoais):**
- o histórico antigo nunca é importado (mensagens com mais de 10 minutos são ignoradas);
- só entra no painel quem já está no CRM: conversa iniciada pelo painel, lead, cliente ou contato da Prospecção;
- mensagens de números desconhecidos ficam só no celular, **exceto quando têm cara de cliente** (falam em cálculo, orçamento, processo, liquidação, impugnação, PJe, advogado; vêm do site ou de anúncio; trazem nº de processo ou PDF). Essas entram no painel como lead e o robô pode atender;
- contato da Prospecção que responde vira lead (origem Prospecção) e fica como "Respondeu".

## 5. WhatsApp dentro do painel (API oficial da Meta)

> **Hoje o atendimento é manual**, pelo app WhatsApp Business do celular. No painel, o botão **💬 WhatsApp** de cada lead abre o seu WhatsApp com a saudação pronta e registra o contato no CRM. A tela de WhatsApp e o robô só aparecem quando `WA_ATIVO` for `true` no `config.js`. Tentativa de 11/11/2026: a Meta não aceitou o 98770-8652 (nem na coexistência, nem na migração: "already in use by another WhatsApp account"). Para ligar no futuro, use um chip novo ou abra um chamado na Meta.

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
Em `site/config.js`, mude `WA_ATIVO: false` para `WA_ATIVO: true` e envie ao GitHub (a Vercel publica sozinha).

### 5.6 Atendimento automático (robô)
1. Painel > **WhatsApp** > **🧪 Testar robô**: converse com o robô como se fosse cliente (nada é enviado).
2. **⚙ Atendimento automático**: horário da equipe, textos de cada resposta e se ele responde quem já é cliente. Marque **Robô ligado** e salve.
3. Como ele age:
   - Quem escreve recebe boas-vindas e o menu: **1** orçamento, **2** preços e prazos, **3** acompanhar cálculo, **4** falar com a equipe.
   - Quando chega o **PDF** ou o **número do processo**, ele confirma, grava no lead e passa para a equipe.
   - Fora do horário, ele avisa quando a equipe volta.
   - Assim que você responde pelo painel, ele fica quieto naquela conversa (12h, ajustável). Na conversa há os botões **Assumir agora** e **Devolver ao robô**.
4. Se você já tinha criado a função `whatsapp-webhook`, cole de novo o arquivo atualizado (`supabase/functions/whatsapp-webhook/index.ts`) e faça o mesmo com `whatsapp-enviar`. Rode o `schema.sql` de novo.

> As mensagens que o robô manda pelo **app** do WhatsApp Business não aparecem para ele: o robô só funciona com o número ligado à API oficial (passos 5.1 a 5.5).

---

## Como o fluxo funciona
| Etapa | Onde |
|---|---|
| Advogado envia PDF (até 50 MB) ou nº do processo no site | entra em **Leads > Novo**, com som e notificação |
| Advogado manda mensagem no WhatsApp | o **robô** responde com o menu e pede o processo; a conversa aparece na tela **WhatsApp**. Número novo vira lead no CRM; PDF ou nº do processo enviado fica gravado no lead |
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
