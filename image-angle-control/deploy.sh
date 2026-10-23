#!/usr/bin/env bash
set -euo pipefail

APP_ID="image-angle-control"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/moduls/app-manager/scripts/deploy_local.sh"
APP_MANAGER_PORT="${APP_MANAGER_PORT_OVERRIDE:-3002}"
APP_MANAGER_BASE_URL="http://127.0.0.1:${APP_MANAGER_PORT}"

if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
  echo "[deploy_${APP_ID}] missing app-manager deploy script: $DEPLOY_SCRIPT"
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
  echo "[deploy_${APP_ID}] missing package.json: $SCRIPT_DIR/package.json"
  exit 1
fi

# Prevent unrelated module settings inherited by the shell from changing app-manager startup.
unset DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSLMODE DATABASE_URL SERVER_PORT

echo "[deploy_${APP_ID}] building and deploying $APP_ID"
echo "[deploy_${APP_ID}] app-manager port: $APP_MANAGER_PORT"

STANDALONE_APP_IDS="$APP_ID" \
SERVER_PORT="$APP_MANAGER_PORT" \
APP_MANAGER_PORT="$APP_MANAGER_PORT" \
BUILD_STANDALONE_APPS=1 \
SKIP_UP_APPS=0 \
FAIL_ON_BUILD_ERRORS=1 \
BUILD_BACKEND="${BUILD_BACKEND:-0}" \
INSTALL_DEPS="${INSTALL_DEPS:-0}" \
SYNC_STANDALONE_CATALOG="${SYNC_STANDALONE_CATALOG:-1}" \
BACKGROUND="${BACKGROUND:-1}" \
bash "$DEPLOY_SCRIPT"

if [[ "${BACKGROUND:-1}" != "1" ]]; then
  exit 0
fi

APP_URL="${APP_MANAGER_BASE_URL}/standalone/${APP_ID}/"
if ! command -v curl >/dev/null 2>&1; then
  echo "[deploy_${APP_ID}] deployed; curl unavailable, skipped route verification"
  exit 0
fi

HTTP_CODE="$(curl -sS -o /dev/null -m 10 -w "%{http_code}" "$APP_URL" || true)"
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[deploy_${APP_ID}] route verification failed: $APP_URL returned ${HTTP_CODE:-000}"
  exit 1
fi

echo "[deploy_${APP_ID}] deploy complete: $APP_URL"
