#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# Manejarr — Deployment Script
# ═══════════════════════════════════════════════════
#
# Usage:
#   ./deploy.sh                          # Interactive setup + deploy
#   ./deploy.sh --port 8080              # Non-interactive with custom port
#   ./deploy.sh --reset-password newpass  # Reset admin password
#   ./deploy.sh --generate-key           # Force regenerate encryption key
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
DEFAULT_PORT=3000
DEFAULT_USERNAME="admin"

# ── Colors ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Manejarr — Production Deployment${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo ""

# ── Parse Arguments ──
PORT=""
TZ_VAL=""
RESET_PASSWORD=""
GENERATE_KEY=false
NON_INTERACTIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      NON_INTERACTIVE=true
      shift 2
      ;;
    --tz)
      TZ_VAL="$2"
      NON_INTERACTIVE=true
      shift 2
      ;;
    --reset-password)
      RESET_PASSWORD="$2"
      shift 2
      ;;
    --generate-key)
      GENERATE_KEY=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./deploy.sh [--port PORT] [--tz TZ] [--reset-password NEWPASS] [--generate-key]"
      exit 1
      ;;
  esac
done

# ── Self-Update & Reload ──
if [ "$RELOADED" != "true" ] && [ -d ".git" ]; then
  if docker ps --format '{{.Names}}' | grep -q manejarr; then
    echo -e "${YELLOW}Manejarr is currently running. Checking for updates...${NC}"
    
    if command -v git >/dev/null 2>&1; then
      echo -e "${CYAN}Pulling latest changes from Git...${NC}"
      git pull
      
      echo -e "${YELLOW}Reloading deployment script...${NC}"
      export RELOADED=true
      exec "$0" "$@"
    else
      echo -e "${RED}git command not found. Skipping auto-update.${NC}"
    fi
  fi
fi

# ── Generate or Load .env ──
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}First-run detected. Configuration required.${NC}"
  
  if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Enter Port [3000]: " USER_PORT
    PORT=${USER_PORT:-$DEFAULT_PORT}
    
    read -p "Enter Timezone [UTC]: " USER_TZ
    TZ_VAL=${USER_TZ:-UTC}
    
    echo -e "Enter Admin Password (leave blank to auto-generate):"
    read -s USER_PASSWORD
    echo ""
    
    if [ -z "$USER_PASSWORD" ]; then
      USER_PASSWORD=$(openssl rand -base64 16)
      echo -e "Generated Password: ${YELLOW}${USER_PASSWORD}${NC}"
      echo -e "${RED}IMPORTANT: Save this password somewhere safe!${NC}"
    fi
  else
    PORT=${PORT:-$DEFAULT_PORT}
    TZ_VAL=${TZ_VAL:-UTC}
    USER_PASSWORD=$(openssl rand -base64 16)
    echo -e "Non-interactive mode: Generated random password.${NC}"
  fi

  echo -e "${CYAN}Generating encryption seeds...${NC}"
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  

  cat > "$ENV_FILE" <<EOF
# Manejarr Configuration — Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
PORT=${PORT}
TZ=${TZ_VAL}
NODE_ENV=production

ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=${DEFAULT_USERNAME}
ADMIN_PASSWORD_HASH=PENDING
EOF

  echo -e "${CYAN}Building Manejarr image to generate secure credentials...${NC}"
  docker build -q -t manejarr .

  echo -e "${CYAN}Generating secure password hash...${NC}"
  # Use the built image to hash the password securely
  ADMIN_PASSWORD_HASH=$(docker run --rm manejarr node -e "
    import bcrypt from 'bcrypt';
    const h = await bcrypt.hash('${USER_PASSWORD}', 12);
    process.stdout.write(h);
  " 2>/dev/null || echo "")

  if [ -n "$ADMIN_PASSWORD_HASH" ]; then
    sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}|" "$ENV_FILE"
    echo -e "${GREEN}✓ .env file created and secured${NC}"
  else
    echo -e "${RED}Failed to generate password hash.${NC}"
    exit 1
  fi
  echo ""
else
  echo -e "${GREEN}✓ Existing .env file found${NC}"
  source "$ENV_FILE"
  
  if [ "$NON_INTERACTIVE" = false ]; then
    read -p "Update Port [${PORT:-3000}]: " USER_PORT
    PORT=${USER_PORT:-$PORT}
    PORT=${PORT:-3000}
    
    read -p "Update Timezone [${TZ:-UTC}]: " USER_TZ
    TZ_VAL=${USER_TZ:-$TZ}
    TZ_VAL=${TZ_VAL:-UTC}
    
    if [ "$ADMIN_PASSWORD_HASH" = "PENDING" ]; then
      echo -e "${YELLOW}⚠ Incomplete deployment detected. You must set an admin password.${NC}"
      while [ -z "$USER_PASSWORD" ]; do
        echo -e "Enter Admin Password:"
        read -s USER_PASSWORD
        echo ""
        if [ -z "$USER_PASSWORD" ]; then echo -e "${RED}Password cannot be empty.${NC}"; fi
      done
    else
      echo -e "Enter New Admin Password (leave blank to keep current):"
      read -s USER_PASSWORD
      echo ""
    fi
    
    if [ -n "$USER_PASSWORD" ]; then
      echo -e "${CYAN}Building Manejarr image to update credentials...${NC}"
      docker build -q -t manejarr .
      
      echo -e "${CYAN}Generating new password hash...${NC}"
      ADMIN_PASSWORD_HASH=$(docker run --rm manejarr node -e "
        import bcrypt from 'bcrypt';
        const h = await bcrypt.hash('${USER_PASSWORD}', 12);
        process.stdout.write(h);
      " 2>/dev/null || echo "")
      
      if [ -n "$ADMIN_PASSWORD_HASH" ]; then
        sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}|" "$ENV_FILE"
        echo -e "${GREEN}✓ Password updated${NC}"
      fi
    fi
  else
    # Non-interactive: use flags if provided, otherwise keep existing
    PORT=${PORT:-$PORT}
    TZ_VAL=${TZ_VAL:-$TZ}

    if [ "$ADMIN_PASSWORD_HASH" = "PENDING" ]; then
      echo -e "${YELLOW}Non-interactive mode detected 'PENDING' password. Auto-generating...${NC}"
      USER_PASSWORD=$(openssl rand -base64 16)
      echo -e "Generated Password: ${YELLOW}${USER_PASSWORD}${NC}"
      
      docker build -q -t manejarr .
      ADMIN_PASSWORD_HASH=$(docker run --rm manejarr node -e "
        import bcrypt from 'bcrypt';
        const h = await bcrypt.hash('${USER_PASSWORD}', 12);
        process.stdout.write(h);
      " 2>/dev/null || echo "")
      
      if [ -n "$ADMIN_PASSWORD_HASH" ]; then
        sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}|" "$ENV_FILE"
      fi
    fi
  fi

  # Apply flag-based overrides and update .env
  if [ -n "$PORT" ]; then
    sed -i "s|^PORT=.*|PORT=${PORT}|" "$ENV_FILE"
  fi
  if [ -n "$TZ_VAL" ]; then
    sed -i "s|^TZ=.*|TZ=${TZ_VAL}|" "$ENV_FILE"
  fi
fi

# ── Force Regenerate Encryption Key ──
if [ "$GENERATE_KEY" = true ]; then
  NEW_KEY=$(openssl rand -hex 32)
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${NEW_KEY}|" "$ENV_FILE"
  echo -e "${YELLOW}⚠ Encryption key regenerated. Existing encrypted settings will be invalid.${NC}"
fi

# ── Reset Password ──
if [ -n "$RESET_PASSWORD" ]; then
  echo -e "${CYAN}Resetting admin password...${NC}"

  # Check if container is running
  if docker ps --format '{{.Names}}' | grep -q manejarr; then
    docker exec manejarr node scripts/reset-password.js "$RESET_PASSWORD"
    echo -e "${GREEN}✓ Password reset successfully.${NC}"
  else
    echo -e "${YELLOW}Container not running. Building and updating hash in .env...${NC}"
    docker build -q -t manejarr .
    NEW_HASH=$(docker run --rm manejarr node -e "
      import bcrypt from 'bcrypt';
      const h = await bcrypt.hash('${RESET_PASSWORD}', 12);
      process.stdout.write(h);
    " 2>/dev/null || echo "")

    if [ -n "$NEW_HASH" ]; then
      sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${NEW_HASH}|" "$ENV_FILE"
      echo -e "${GREEN}✓ Password hash updated in .env${NC}"
    fi
  fi

  exit 0
fi

# ── Deploy ──
echo ""
echo -e "${CYAN}Deploying Manejarr (Production Mode)...${NC}"
docker compose up -d --build --force-recreate

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Manejarr is live!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"

source "$ENV_FILE"
echo -e "  URL: ${CYAN}http://localhost:${PORT:-3000}${NC}"
echo -e "  User: ${YELLOW}${ADMIN_USERNAME:-admin}${NC}"
echo -e "  TZ: ${CYAN}${TZ:-UTC}${NC}"
echo ""

echo -e "${CYAN}Streaming logs (Ctrl+C to stop viewing, service will remain running)...${NC}"
docker compose logs -f
