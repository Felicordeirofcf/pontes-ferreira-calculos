#!/usr/bin/env bash
# Vigia do WhatsApp (Evolution API): resolve o "funciona um tempo e depois para de receber".
#
# O problema: a conexão com o WhatsApp às vezes fica "meio aberta". O servidor ainda diz "conectado",
# mas o canal parou de trazer mensagens novas. Só reiniciar a Evolution resolve, e a sessão
# (o QR code) não se perde com isso.
#
# O que este vigia faz a cada 3 minutos:
#   1. confere se a Evolution está de pé e se o WhatsApp diz "open";
#   2. faz uma pergunta de verdade ao WhatsApp ("este número tem WhatsApp?" sobre o próprio número).
#      Se o canal estiver travado, a pergunta não volta;
#   3. se falhar 2 vezes seguidas, reinicia a Evolution (leva uns 30 s; as mensagens que chegarem
#      nesse meio-tempo são entregues quando ela volta);
#   4. além disso, reinicia por prevenção a cada 6 horas (00h, 06h, 12h, 18h).
# Tudo fica anotado em /var/log/vigia-whatsapp.log
#
# Uso no servidor:
#   sudo bash vigia-whatsapp.sh instalar    -> liga o vigia
#   sudo bash vigia-whatsapp.sh ver         -> mostra o que o vigia fez
#   sudo bash vigia-whatsapp.sh remover     -> desliga o vigia
#   sudo bash vigia-whatsapp.sh checar      -> faz uma verificação agora (é o que o vigia roda)
set -uo pipefail
DIR=/opt/evolution
INST=${INST:-pontes}
LOG=/var/log/vigia-whatsapp.log
ESTADO=/var/tmp/vigia-whatsapp.falhas
ESTE=/usr/local/bin/vigia-whatsapp.sh
log() { echo "$(date '+%d/%m %H:%M:%S') $*" >> "$LOG"; }

case "${1:-checar}" in
instalar)
  install -m 755 "$0" "$ESTE"
  cat > /etc/cron.d/vigia-whatsapp <<EOF
*/3 * * * * root $ESTE checar
5 0,6,12,18 * * * root $ESTE prevencao
EOF
  chmod 644 /etc/cron.d/vigia-whatsapp
  touch "$LOG"; log "vigia instalado"
  echo "Vigia ligado. Primeira verificação agora:"; "$ESTE" checar; tail -3 "$LOG"
  echo "Para acompanhar: sudo bash $ESTE ver"
  exit 0 ;;
remover)
  rm -f /etc/cron.d/vigia-whatsapp "$ESTADO"; log "vigia removido"; echo "Vigia desligado."; exit 0 ;;
ver)
  echo "== últimas 40 anotações do vigia"; tail -40 "$LOG" 2>/dev/null || echo "(nada ainda)"
  echo "== reinícios nas últimas 24h: $(grep -c 'REINICIANDO' "$LOG" 2>/dev/null || echo 0) (total no log)"
  echo "== memória da Evolution agora"; docker stats --no-stream --format '{{.Name}}: {{.MemUsage}} ({{.MemPerc}})' 2>/dev/null | grep -i evolution
  exit 0 ;;
esac

cd "$DIR" || exit 1
reiniciar() { log "REINICIANDO a Evolution: $1"; docker compose restart evolution </dev/null >/dev/null 2>&1; echo 0 > "$ESTADO"; sleep 40
  log "depois do reinício: $(api GET "/instance/connectionState/$INST" | grep -o '"state":"[a-z]*"' || echo 'sem resposta')"; }
KEY=$(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2)
DOMINIO=$(grep '^DOMINIO=' .env | cut -d= -f2)
# fala com a Evolution pelo mesmo endereço que o painel usa (a porta 8080 não fica exposta no servidor)
api() { curl -s -m 25 -X "$1" "https://$DOMINIO$2" -H "apikey: $KEY" -H 'Content-Type: application/json' ${3:+-d "$3"}; }

if [ "${1:-}" = "prevencao" ]; then reiniciar "reinício preventivo das 6 horas"; exit 0; fi

FALHAS=$(cat "$ESTADO" 2>/dev/null || echo 0)
EST=$(api GET "/instance/connectionState/$INST" | grep -o '"state":"[a-z]*"' | cut -d'"' -f4)
if [ "$EST" != "open" ]; then
  # "close" sem sessão precisa de QR code, reiniciar não resolve; "connecting" travado ou sem resposta, reiniciar ajuda
  FALHAS=$((FALHAS + 1)); echo "$FALHAS" > "$ESTADO"; log "falha $FALHAS: estado '${EST:-sem resposta}'"
  [ "$FALHAS" -ge 2 ] && reiniciar "estado '${EST:-sem resposta}' em 2 verificações seguidas"
  exit 0
fi
NUM=$(api GET "/instance/fetchInstances?instanceName=$INST" | grep -o '"ownerJid":"[0-9]*' | grep -o '[0-9]*$' | head -1)
if [ -z "$NUM" ]; then log "aviso: não achei o número da instância, pulei o teste do canal"; echo 0 > "$ESTADO"; exit 0; fi
INI=$(date +%s)
R=$(api POST "/chat/whatsappNumbers/$INST" "{\"numbers\":[\"$NUM\"]}")
DUR=$(( $(date +%s) - INI ))
if echo "$R" | grep -q '"exists":true'; then
  [ "$FALHAS" -gt 0 ] && log "ok de novo (canal respondeu em ${DUR}s)"
  echo 0 > "$ESTADO"
else
  FALHAS=$((FALHAS + 1)); echo "$FALHAS" > "$ESTADO"
  log "falha $FALHAS: conectado, mas o canal não respondeu em ${DUR}s ($(echo "$R" | head -c 120))"
  [ "$FALHAS" -ge 2 ] && reiniciar "canal travado (conectado mas sem resposta)"
fi
