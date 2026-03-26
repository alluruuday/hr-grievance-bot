#!/bin/bash
# setup-prod.sh — Full production setup on a fresh DigitalOcean Droplet
# Run this ON the Droplet as root: bash setup-prod.sh
#
# Prerequisites (do these first on your laptop):
#   1. Create a DuckDNS account at https://www.duckdns.org
#   2. Create a subdomain e.g. bhanzu-hr  → you'll get bhanzu-hr.duckdns.org
#   3. Point it to your Droplet IP (paste IP into DuckDNS dashboard)
#   4. Create a DigitalOcean Droplet: Ubuntu 22.04, 2 GB RAM, 50 GB SSD
#   5. SSH into it: ssh root@YOUR_DROPLET_IP
#   6. Upload this repo: rsync -avz --exclude='node_modules' --exclude='.env' \
#        ./hr-grievance-bot root@YOUR_DROPLET_IP:/opt/

set -e

DOMAIN="${1:-YOUR_SUBDOMAIN.duckdns.org}"
DUCKDNS_TOKEN="${2:-YOUR_DUCKDNS_TOKEN}"    # from duckdns.org dashboard
APP_DIR="/opt/hr-grievance-bot"
EMAIL="admin@${DOMAIN}"

echo "========================================"
echo " Bhanzu HR Assistant — Production Setup"
echo " Domain : $DOMAIN"
echo " App dir: $APP_DIR"
echo "========================================"

# ─── 1. System packages ──────────────────────────────────────────────────────
apt-get update -qq
apt-get install -y -qq curl git ufw certbot python3-certbot-dns-duckdns

# ─── 2. Docker ───────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
fi

# ─── 3. Firewall ─────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ─── 4. DuckDNS auto-renewal cron ────────────────────────────────────────────
SUBDOMAIN="${DOMAIN%.duckdns.org}"
cat > /etc/cron.d/duckdns << EOF
*/5 * * * * root curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o /tmp/duckdns.log
EOF

# Update IP now
curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=" -o /tmp/duckdns.log
echo "DuckDNS update: $(cat /tmp/duckdns.log)"

# ─── 5. SSL Certificate (Let's Encrypt via DuckDNS DNS challenge) ────────────
mkdir -p /etc/letsencrypt
cat > /etc/letsencrypt/duckdns.ini << EOF
dns_duckdns_token = ${DUCKDNS_TOKEN}
EOF
chmod 600 /etc/letsencrypt/duckdns.ini

certbot certonly \
  --authenticator dns-duckdns \
  --dns-duckdns-credentials /etc/letsencrypt/duckdns.ini \
  --dns-duckdns-propagation-seconds 60 \
  -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --no-eff-email

# Copy certs to app nginx dir
mkdir -p "${APP_DIR}/nginx/certs"
cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem "${APP_DIR}/nginx/certs/"
cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem  "${APP_DIR}/nginx/certs/"
chmod 644 "${APP_DIR}/nginx/certs/"*

# Auto-renew cron
cat > /etc/cron.d/certbot-renew << EOF
0 3 * * * root certbot renew --quiet && \
  cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ${APP_DIR}/nginx/certs/ && \
  cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ${APP_DIR}/nginx/certs/ && \
  docker compose -f ${APP_DIR}/docker-compose.yml restart nginx
EOF

# ─── 6. Nginx config — patch domain ──────────────────────────────────────────
sed -i "s/server_name _;/server_name ${DOMAIN};/g" "${APP_DIR}/nginx/nginx.conf"

# ─── 7. .env check ───────────────────────────────────────────────────────────
if [ ! -f "${APP_DIR}/.env" ]; then
  echo ""
  echo "⚠️  No .env found at ${APP_DIR}/.env"
  echo "    Copy your local .env there and set:"
  echo "      POSTGRES_HOST=postgres"
  echo "      GOOGLE_CALLBACK_URL=https://${DOMAIN}/api/auth/google/callback"
  echo "      FRONTEND_URL=https://${DOMAIN}"
  echo "      NODE_ENV=production"
  echo ""
  exit 1
fi

# Patch the .env for prod
sed -i "s|POSTGRES_HOST=localhost|POSTGRES_HOST=postgres|g"          "${APP_DIR}/.env"
sed -i "s|NODE_ENV=development|NODE_ENV=production|g"                "${APP_DIR}/.env"
sed -i "s|GOOGLE_CALLBACK_URL=.*|GOOGLE_CALLBACK_URL=https://${DOMAIN}/api/auth/google/callback|g" "${APP_DIR}/.env"
sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN}|g"         "${APP_DIR}/.env"
sed -i "s|VITE_API_URL=.*|VITE_API_URL=https://${DOMAIN}/api|g"     "${APP_DIR}/.env"

# ─── 8. Build & start ────────────────────────────────────────────────────────
cd "${APP_DIR}"
docker compose build --no-cache
docker compose up -d

echo ""
echo "✅  Setup complete!"
echo ""
echo "    🌐  https://${DOMAIN}"
echo "    👤  Default admin: admin@company.com / Admin@1234"
echo "    ⚠️   Change the admin password immediately!"
echo ""
echo "Next step on Google Cloud Console:"
echo "  Add authorized redirect URI:"
echo "    https://${DOMAIN}/api/auth/google/callback"
