#!/usr/bin/env bash
# Patch da Evolution API 2.3.7: troca a biblioteca do WhatsApp (Baileys) 7.0.0-rc.9 pela mais nova.
#
# Por quê: a 2.3.7 (e até a 2.4) vem com a Baileys rc.9, de nov/2025. As versões rc10 a rc14
# (mai–jul/2026, publicadas pelo repositório oficial WhiskeySockets/Baileys) corrigem quedas de conexão,
# o erro 463 de mensagens, a sincronização que abortava e as chaves de criptografia.
# A parte da Baileys que a Evolution usa não mudou entre essas versões.
#
# Uso no servidor:
#   sudo bash patch-baileys.sh              -> aplica (Baileys 7.0.0-rc14)
#   sudo bash patch-baileys.sh desfazer     -> volta para a imagem original da Evolution 2.3.7
#
# A sessão do WhatsApp, as conversas e as configurações ficam nos volumes e não são apagadas.
set -euo pipefail
DIR=/opt/evolution
BAILEYS=${BAILEYS:-7.0.0-rc14}
ORIGINAL='evoapicloud/evolution-api:v2.3.7'
cd "$DIR"

if [ "${1:-}" = "desfazer" ]; then
  echo "== Voltando para a imagem original ($ORIGINAL)"
  sed -i -E '/^    build:/d; s#^    image: pontes/evolution-api:.*#    image: '"$ORIGINAL"'#' docker-compose.yml
  docker compose up -d evolution </dev/null
  echo "Pronto. A Evolution voltou para a Baileys original."
  exit 0
fi

echo "== 1/4 Backup da configuração"
cp docker-compose.yml "docker-compose.yml.antes-patch-$(date +%Y%m%d-%H%M)"

echo "== 2/4 Montando a imagem com a Baileys $BAILEYS"
cat > Dockerfile.baileys <<EOF
FROM $ORIGINAL
# Baileys nova numa pasta separada (com as dependências dentro dela) e depois no lugar da antiga.
# Não reinstala o resto da Evolution.
RUN mkdir /tmp/b && cd /tmp/b && echo '{"name":"b","private":true}' > package.json \\
 && npm install --no-audit --no-fund --ignore-scripts --omit=dev --install-strategy=nested baileys@$BAILEYS \\
 && rm -rf /evolution/node_modules/baileys \\
 && mv /tmp/b/node_modules/baileys /evolution/node_modules/baileys \\
 && rm -rf /tmp/b /root/.npm \\
 && node -e "console.log('Baileys instalada:', require('/evolution/node_modules/baileys/package.json').version)"
EOF
TAG="pontes/evolution-api:2.3.7-baileys-$BAILEYS"
# no docker-compose.yml: troca a imagem pronta pela imagem montada aqui
if grep -qE "^    image: $ORIGINAL" docker-compose.yml; then
  sed -i -E "s#^    image: $ORIGINAL#    build: { context: ., dockerfile: Dockerfile.baileys }\n    image: $TAG#" docker-compose.yml
else
  sed -i -E "s#^    image: pontes/evolution-api:.*#    image: $TAG#" docker-compose.yml
fi
docker compose build evolution </dev/null

echo "== 3/4 Reiniciando a Evolution"
docker compose up -d evolution </dev/null
echo "Aguardando subir (40s)…"; sleep 40

echo "== 4/4 Conferência"
docker compose exec -T evolution node -e "console.log('Baileys em uso:', require('/evolution/node_modules/baileys/package.json').version)" </dev/null || true
KEY=$(docker compose exec -T evolution printenv AUTHENTICATION_API_KEY </dev/null | tr -d '\r')
docker compose exec -T evolution wget -qO- --header "apikey: $KEY" http://127.0.0.1:8080/instance/connectionState/pontes </dev/null || true; echo
echo "--- últimas linhas do log (erros aparecem aqui) ---"
docker compose logs --since 2m --no-color evolution </dev/null | grep -iE "error|baileys|connect|qr|started|listening" | tail -15 || true
echo
echo 'Se aparecer "state":"open", o WhatsApp continua conectado. Se aparecer "close" ou "connecting",'
echo 'reconecte pelo painel (aba WhatsApp > Conectar > QR code). Se a Evolution não subir: sudo bash patch-baileys.sh desfazer'
