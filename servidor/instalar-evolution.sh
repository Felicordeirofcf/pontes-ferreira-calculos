#!/usr/bin/env bash
# =====================================================================
# Evolution API no servidor Pontes Ferreira (Locaweb Cloud · Ubuntu 24.04)
# Liga o WhatsApp ao painel como "WhatsApp Web" (o app do celular continua funcionando).
#
# Antes de rodar:
#   1. DNS (Locaweb): registro A  "wa"  ->  IP público do servidor
#   2. Locaweb Cloud: liberar e encaminhar as portas 80 e 443 para esta máquina
# Como usar (console do servidor, como root):
#   curl -fsSL https://raw.githubusercontent.com/Felicordeirofcf/pontes-ferreira-calculos/main/servidor/instalar-evolution.sh -o instalar-evolution.sh
#   bash instalar-evolution.sh
# Pode rodar de novo: mantém as senhas já geradas e só atualiza o que mudou.
# =====================================================================
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode como root (sudo bash instalar-evolution.sh)"; exit 1; }
DOMINIO="${DOMINIO:-wa.pontesferreiracalculos.com}"
DIR=/opt/evolution
REPO=https://raw.githubusercontent.com/Felicordeirofcf/pontes-ferreira-calculos/main/servidor/evolution

echo "== 1/6 Docker"
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2 curl openssl
fi
systemctl enable --now docker

echo "== 2/6 Memória extra (swap de 2 GB, para o servidor de 2 GB não travar)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 3/6 Arquivos em $DIR"
install -d -m 700 "$DIR"; cd "$DIR"
curl -fsSL "$REPO/docker-compose.yml" -o docker-compose.yml
curl -fsSL "$REPO/Caddyfile" -o Caddyfile
if [ ! -f .env ]; then
  API_KEY=$(openssl rand -hex 24); PG=$(openssl rand -hex 16)
  cat > .env <<ENV
DOMINIO=$DOMINIO
PG_SENHA=$PG
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=https://$DOMINIO
AUTHENTICATION_API_KEY=$API_KEY
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false
LANGUAGE=pt-BR
LOG_LEVEL=ERROR,WARN,INFO
DEL_INSTANCE=false
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$PG@postgres:5432/evolution?schema=evolution_api
DATABASE_CONNECTION_CLIENT_NAME=pontes
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=false
DATABASE_SAVE_MESSAGE_UPDATE=false
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=false
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379/6
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false
CONFIG_SESSION_PHONE_CLIENT=Pontes Ferreira
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_REQUEST_TIMEOUT_MS=30000
ENV
  chmod 600 .env
fi
grep -q "^DOMINIO=" .env || echo "DOMINIO=$DOMINIO" >> .env

echo "== 4/6 Conferindo o DNS de $DOMINIO"
IP_PUB=$(curl -fsS -m 10 https://api.ipify.org || echo "?")
IP_DNS=$(getent hosts "$DOMINIO" | awk '{print $1}' | head -1 || true)
echo "   IP público deste servidor: $IP_PUB · $DOMINIO aponta para: ${IP_DNS:-(nada)}"
[ "$IP_PUB" = "$IP_DNS" ] || echo "   ATENÇÃO: o DNS ainda não aponta para este servidor. O https só funciona quando apontar."

echo "== 5/6 Subindo a Evolution API (a primeira vez baixa ~1 GB, leva alguns minutos)"
docker compose --env-file .env pull -q
docker compose --env-file .env up -d

echo "== 6/6 Testando"
for i in $(seq 1 60); do
  if docker compose exec -T evolution wget -qO- http://localhost:8080/ >/dev/null 2>&1; then OK=1; break; fi; sleep 5
done
[ "${OK:-}" = 1 ] && echo "   Evolution API: OK" || echo "   Evolution API ainda iniciando. Veja: docker compose -f $DIR/docker-compose.yml logs evolution --tail 50"
sleep 5
curl -fsS -m 15 -o /dev/null "https://$DOMINIO/" && echo "   https://$DOMINIO: OK" || echo "   https://$DOMINIO ainda não responde (confira DNS e portas 80/443 na Locaweb)."
echo
echo "================= COPIE PARA OS SECRETS DO SUPABASE ================="
echo "EVOLUTION_URL = https://$DOMINIO"
echo "EVOLUTION_KEY = $(grep '^AUTHENTICATION_API_KEY=' .env | cut -d= -f2)"
echo "====================================================================="
echo "Depois, no painel: WhatsApp > Conectar WhatsApp > escaneie o QR code com o celular."
