#!/bin/bash
# deploy.sh — One-command deploy to DigitalOcean Droplet
# Usage: ./deploy.sh [droplet-ip]
set -e

DROPLET_IP=${1:-"YOUR_DROPLET_IP"}
REMOTE_DIR="/opt/hr-grievance-bot"

echo "▶ Deploying HR Grievance Bot to $DROPLET_IP"

# 1. Sync project files (excluding node_modules, certs, .env)
rsync -avz --exclude='node_modules' --exclude='dist' --exclude='.env' \
  --exclude='nginx/certs' --exclude='*.log' \
  ./ root@$DROPLET_IP:$REMOTE_DIR/

# 2. Run on the droplet
ssh root@$DROPLET_IP << REMOTE
  set -e
  cd $REMOTE_DIR

  # Install Docker if missing
  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
  fi

  # Install Docker Compose plugin if missing
  if ! docker compose version &> /dev/null; then
    apt-get install -y docker-compose-plugin
  fi

  # Create certs dir for SSL (populate with your cert files)
  mkdir -p nginx/certs

  # Build and start
  docker compose pull postgres  # pull base images first
  docker compose build --no-cache
  docker compose up -d

  echo "✅ Deploy complete. Services:"
  docker compose ps
REMOTE

echo "✅ Done. App is live at https://$DROPLET_IP"
echo ""
echo "Next steps:"
echo "  1. SSH in and copy SSL certs to nginx/certs/fullchain.pem and privkey.pem"
echo "  2. Update .env with your actual ANTHROPIC_API_KEY, KEKA_*, DO_SPACES_* values"
echo "  3. Run: docker compose restart nginx"
