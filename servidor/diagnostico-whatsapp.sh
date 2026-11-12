#!/usr/bin/env bash
# Diagnóstico do recebimento de mensagens (Evolution API -> painel).
# Uso no servidor:  sudo bash diagnostico-whatsapp.sh
# Não altera nada e não mostra senhas.
DIR=/opt/evolution
cd "$DIR" 2>/dev/null || { echo "Pasta $DIR não encontrada"; exit 1; }
KEY=$(docker compose exec -T evolution printenv AUTHENTICATION_API_KEY </dev/null 2>/dev/null | tr -d '\r')  # chave em uso pelo container
[ -n "$KEY" ] || KEY=$(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2)
[ "$KEY" = "$(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2)" ] || echo "AVISO: a chave do .env é diferente da que o Evolution está usando (falta reiniciar: docker compose up -d)"
INST=${1:-pontes}
# </dev/null: sem isso o "docker compose exec" engole o resto do script quando ele roda via "curl | bash"
apiE() { docker compose exec -T evolution wget -qO- --header "apikey: $KEY" "http://127.0.0.1:8080$1" </dev/null 2>&1 | head -c 1500; }

echo "===== 1. Containers"
docker compose ps </dev/null --format '{{.Service}}: {{.State}} ({{.Status}})'

echo; echo "===== 2. Versão e conexão"
apiE / | head -c 300; echo
apiE "/instance/connectionState/$INST"; echo

echo; echo "===== 3. Webhook da instância (a senha ?k= aparece mascarada)"
apiE "/webhook/find/$INST" | sed -E 's/k=[^"&]+/k=***/g'; echo

LOG=$(docker compose logs evolution --since 6h --no-color </dev/null 2>/dev/null)
echo; echo "===== 4. Mensagens recebidas nas últimas 6h (contagem)"
echo "remoteJid com número (@s.whatsapp.net): $(grep -c "remoteJid: '[0-9]*@s.whatsapp.net'" <<<"$LOG")"
echo "remoteJid ocultos (@lid):               $(grep -c "remoteJid: '[0-9]*@lid'" <<<"$LOG")"
echo "com remoteJidAlt preenchido:            $(grep -c "remoteJidAlt: '[0-9]" <<<"$LOG")"
echo "fromMe: false (recebidas):              $(grep -c "fromMe: false" <<<"$LOG")"

echo; echo "===== 5. Erros de descriptografia / sessão / webhook (últimas 6h)"
grep -i -E "bad mac|no session|failed to decrypt|decrypt|sessionerror|webhook.*(error|fail)|ECONNREFUSED|ETIMEDOUT|status code [45]" <<<"$LOG" | tail -15 | cut -c1-220

echo; echo "===== 6. Últimas chaves de mensagem (números mascarados)"
grep -E "remoteJid(Alt)?: '|fromMe: |addressingMode: " <<<"$LOG" | tail -24 | sed -E "s/'([0-9]{4})[0-9]+([0-9]{2})@/'\1*****\2@/g"
echo; echo "Fim. Copie tudo acima e envie no chat."
