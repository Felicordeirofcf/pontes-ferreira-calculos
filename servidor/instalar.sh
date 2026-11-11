#!/usr/bin/env bash
# =====================================================================
# Servidor Pontes Ferreira (Locaweb Cloud · Ubuntu 24.04)
# Faz duas coisas, sozinho, todos os dias:
#   1. Mantém o Supabase acordado (o plano grátis pausa após 7 dias sem uso)
#   2. Backup diário do banco, guardando os últimos 14 dias
#
# Como usar (no console do servidor, logado como root):
#   curl -fsSL https://raw.githubusercontent.com/Felicordeirofcf/pontes-ferreira-calculos/main/servidor/instalar.sh -o instalar.sh
#   bash instalar.sh
# O script pergunta a URL, a chave anon e a conexão do banco. Nada disso fica no GitHub.
# Pode rodar de novo quando quiser (para trocar as chaves, por exemplo).
# =====================================================================
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode como root (sudo bash instalar.sh)"; exit 1; }

echo "== 1/5 Atualizando o sistema e ligando atualizações de segurança automáticas"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q curl ca-certificates gnupg unattended-upgrades cron
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 2/5 Instalando o cliente do PostgreSQL 17 (mesma versão do Supabase)"
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update -q
apt-get install -y -q postgresql-client-17

echo "== 3/5 Dados do Supabase (ficam só neste servidor, em /etc/pontes.env)"
echo "Supabase > Project Settings > API:"
read -rp "  Project URL (https://xxxx.supabase.co): " SUPABASE_URL
read -rp "  Chave anon public: " SUPABASE_ANON_KEY
echo "Supabase > botão Connect (no topo) > Session pooler > URI (copie SEM trocar o [YOUR-PASSWORD]):"
read -rp "  Conexão do banco: " DB_SEM_SENHA
read -rsp "  Senha do banco (não aparece enquanto digita): " DB_SENHA; echo
SENHA_URL=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$DB_SENHA")
DB_URL="${DB_SEM_SENHA/\[YOUR-PASSWORD\]/$SENHA_URL}"
case "$DB_URL" in *YOUR-PASSWORD*|"") echo "Conexão inválida: confira o endereço copiado do Supabase."; exit 1;; esac
umask 077
cat > /etc/pontes.env <<ENV
SUPABASE_URL="${SUPABASE_URL%/}"
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
DB_URL="$DB_URL"
ENV
chmod 600 /etc/pontes.env

echo "== 4/5 Criando as tarefas"
install -d -m 700 /var/backups/pontes
cat > /usr/local/bin/pontes-manter-ativo <<'SH'
#!/usr/bin/env bash
# Consulta leve ao banco para o Supabase não pausar o projeto
set -euo pipefail; . /etc/pontes.env
curl -fsS -m 30 "$SUPABASE_URL/rest/v1/ajustes?select=chave&limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" >/dev/null
echo "$(date '+%F %T') ok" >> /var/log/pontes-manter-ativo.log
SH
cat > /usr/local/bin/pontes-backup <<'SH'
#!/usr/bin/env bash
# Backup do banco (tabelas e dados do schema public), mantém 14 dias
set -euo pipefail; . /etc/pontes.env
arq="/var/backups/pontes/pontes-$(date +%F).dump"
pg_dump "$DB_URL" --schema=public --format=custom --no-owner --no-privileges --file="$arq.tmp"
mv "$arq.tmp" "$arq"
find /var/backups/pontes -name 'pontes-*.dump' -mtime +14 -delete
echo "$(date '+%F %T') ok $(du -h "$arq" | cut -f1)" >> /var/log/pontes-backup.log
SH
chmod 700 /usr/local/bin/pontes-manter-ativo /usr/local/bin/pontes-backup
cat > /etc/cron.d/pontes <<'CRON'
CRON_TZ=America/Sao_Paulo
17 */6 * * * root /usr/local/bin/pontes-manter-ativo 2>>/var/log/pontes-manter-ativo.log
23 3 * * *   root /usr/local/bin/pontes-backup       2>>/var/log/pontes-backup.log
CRON
chmod 644 /etc/cron.d/pontes
timedatectl set-timezone America/Sao_Paulo || true
systemctl enable --now cron

echo "== 5/5 Testando agora"
/usr/local/bin/pontes-manter-ativo && echo "  Supabase: OK"
/usr/local/bin/pontes-backup && echo "  Backup: OK -> $(ls -1t /var/backups/pontes | head -1)"
echo
echo "Pronto. Banco mantido ativo a cada 6h e backup todo dia às 3h23 (14 dias guardados em /var/backups/pontes)."
echo "Dica: troque a senha do servidor com o comando:  passwd"
