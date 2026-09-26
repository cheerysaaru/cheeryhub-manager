#!/usr/bin/env bash
# One-time backend bootstrap for the CyberPanel (OpenLiteSpeed) server.
# Usage (as root):  bash deploy/setup-server.sh
#
# Env overrides:
#   APP_DIR=/opt/cheeryhub  REPO_URL=https://github.com/you/repo.git
#   SERVICE_USER=cheeryhub  PORT=4000  FRONTEND_ORIGIN=https://you.github.io
#   SKIP_MIGRATE=1          (set when you uploaded an existing prisma/dev.db
#                            that already has its tables)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cheeryhub}"
REPO_URL="${REPO_URL:-https://github.com/cheerysaaru/cheeryhub-manager.git}"
SERVICE_USER="${SERVICE_USER:-cheeryhub}"
PORT="${PORT:-4000}"
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://cheerysaaru.github.io}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash deploy/setup-server.sh"
cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# --- 1. Node.js 22+ -------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  log "Installing Node.js 22 (NodeSource)"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg git
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs git
  else
    die "Unsupported package manager. Install Node.js 22+ manually and re-run."
  fi
fi
log "Node $(node -v), npm $(npm -v)"
command -v git >/dev/null 2>&1 || die "git is not installed"

# --- 2. Service user ------------------------------------------------------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user '$SERVICE_USER'"
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

# --- 3. Code --------------------------------------------------------------
# Priority: existing git checkout > existing upload in APP_DIR >
#           the copy this script was run from > fresh clone.
run_as() { sudo -u "$SERVICE_USER" env HOME="$APP_DIR" bash -lc "cd '$APP_DIR' && $*"; }

if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing checkout ($APP_DIR)"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  run_as "git pull --ff-only"
else
  if [ -f "$APP_DIR/package.json" ]; then
    log "Found existing upload in $APP_DIR (keeping files)"
  elif [ -f "$PROJECT_ROOT/package.json" ]; then
    log "Copying project files from $PROJECT_ROOT to $APP_DIR"
    mkdir -p "$APP_DIR"
    cp -a "$PROJECT_ROOT/." "$APP_DIR/"
  else
    log "Cloning $REPO_URL"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL" "$APP_DIR"
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
fi

# --- 4. Install, generate, build -----------------------------------------
log "Installing dependencies (npm ci)"
run_as "npm ci"

log "Generating Prisma client"
run_as "npx prisma generate --schema=prisma/schema.prisma"

log "Building backend"
run_as "npm run build --workspace backend"

# --- 5. Server .env -------------------------------------------------------
ENV_FILE="$APP_DIR/backend/.env"
if [ -f "$ENV_FILE" ]; then
  log "Keeping existing $ENV_FILE"
else
  log "Creating $ENV_FILE"
  if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET="$(openssl rand -hex 32)"
  else
    JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="$JWT_SECRET"
PORT=$PORT
NODE_ENV=production
FRONTEND_URL="$FRONTEND_ORIGIN"
COOKIE_SAME_SITE="none"
COOKIE_SECURE="true"
EOF
fi
chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# --- 6. Database ----------------------------------------------------------
if [ "$SKIP_MIGRATE" != "1" ]; then
  log "Applying Prisma migrations"
  run_as "npx prisma migrate deploy --schema=prisma/schema.prisma"
else
  log "Skipping migrations (SKIP_MIGRATE=1)"
fi

# --- 7. systemd -----------------------------------------------------------
log "Installing systemd service"
UNIT_SRC="$PROJECT_ROOT/deploy/cheeryhub-api.service"
UNIT_DST="/etc/systemd/system/cheeryhub-api.service"
sed -e "s|__APP_DIR__|$APP_DIR|g" -e "s|__SERVICE_USER__|$SERVICE_USER|g" \
  "$UNIT_SRC" > "$UNIT_DST"
systemctl daemon-reload
systemctl enable cheeryhub-api >/dev/null 2>&1
systemctl restart cheeryhub-api
sleep 3
systemctl --no-pager -l status cheeryhub-api | head -n 12

# --- 8. Smoke test --------------------------------------------------------
log "Local smoke test (before reverse proxy)"
if curl -fsS "http://127.0.0.1:${PORT}/api/health"; then
  echo
else
  die "Health check failed - see: journalctl -u cheeryhub-api -n 50 --no-pager"
fi

cat <<EOF

============================================================
Backend is running on 127.0.0.1:${PORT}

Next: point https://api.cheeryhub.space at it.

  1. CyberPanel -> Websites -> Create Website -> api.cheeryhub.space
  2. Websites -> (that site) -> Reverse Proxy -> Add
        Target: http://127.0.0.1:${PORT}
  3. Issue SSL for the site (Websites -> SSL -> Issue SSL).
  4. Restart OpenLiteSpeed:  systemctl restart lsws
  5. Verify from anywhere:   bash deploy/verify.sh

Full guide: deploy/DEPLOY.md
============================================================
EOF
