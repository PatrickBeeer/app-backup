#!/usr/bin/env bash
# Deploy jade-main-image-app: build frontend, register catalog row, verify routes.
# Idempotent — safe to re-run. Mirrors the standalone_app_host_handbook mutation-window flow.
set -euo pipefail

APP_ID="jade-main-image-app"
APP_TITLE="翡翠主图影棚"
APP_DESC="AI 翡翠主图生成：5 张商业主图（黑色主图、种水细节、金扣工艺、轻场景、人物佩戴）"
APP_ICON="jade"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_DIR="$SCRIPT_DIR"
SHARED_DEPS_DIR="$REPO_ROOT/apps/shared_dependencies"
DEPLOY_LOCAL="$REPO_ROOT/moduls/app-manager/scripts/deploy_local.sh"
APP_MGR_PORT="${SERVER_PORT:-${APP_MANAGER_PORT:-3002}}"
APP_MGR_BASE="http://127.0.0.1:${APP_MGR_PORT}"

# --- helpers -----------------------------------------------------------------
c_ok() { printf "\033[32m[ok]\033[0m %s\n" "$1"; }
c_do() { printf "\033[36m[do]\033[0m %s\n" "$1"; }
c_warn() { printf "\033[33m[warn]\033[0m %s\n" "$1"; }
c_fail() { printf "\033[31m[fail]\033[0m %s\n" "$1"; }

require() { command -v "$1" >/dev/null 2>&1 || { c_fail "missing dependency: $1"; exit 1; }; }
http_code() { curl -s -o /dev/null -m 6 -w "%{http_code}" "$@" 2>/dev/null || echo "000"; }

# --- 1. build frontend -------------------------------------------------------
c_do "building frontend (Vite)..."
require pnpm
require curl
pushd "$SHARED_DEPS_DIR" >/dev/null
if ! pnpm --filter jade-main-image-app-standalone build >/tmp/jade_build.log 2>&1; then
  c_fail "vite build failed; tail of log:"
  tail -n 40 /tmp/jade_build.log
  exit 1
fi
popd >/dev/null
if [[ ! -f "$APP_DIR/dist/index.html" ]]; then
  c_fail "dist/index.html missing after build"
  exit 1
fi
c_ok "frontend built -> dist/index.html"

# --- 2. ensure app-manager is running ---------------------------------------
c_do "checking app-manager on port $APP_MGR_PORT..."
if [[ "$(http_code "$APP_MGR_BASE/health")" != "200" ]]; then
  c_warn "app-manager not healthy; starting it via deploy_local.sh (default build+sync)"
  BUILD_BACKEND=1 BUILD_STANDALONE_APPS=0 "$DEPLOY_LOCAL"
  sleep 1
  if [[ "$(http_code "$APP_MGR_BASE/health")" != "200" ]]; then
    c_fail "app-manager still not healthy on $APP_MGR_PORT; aborting"
    exit 1
  fi
fi
c_ok "app-manager healthy"

# --- 3. open mutation window -------------------------------------------------
c_do "opening mutation window (APP_MANAGER_ENABLE_MUTATIONS=true)..."
# Restart backend with mutations enabled. Skip backend rebuild + standalone rebuild + catalog sync
# so the only catalog change is our explicit POST below.
APP_MANAGER_ENABLE_MUTATIONS=true \
  BUILD_BACKEND=0 BUILD_STANDALONE_APPS=0 SYNC_STANDALONE_CATALOG=0 \
  "$DEPLOY_LOCAL" >/tmp/jade_mut_open.log 2>&1
sleep 1
if [[ "$(http_code "$APP_MGR_BASE/health")" != "200" ]]; then
  c_fail "app-manager did not come back after mutation-window start; tail:"
  tail -n 40 /tmp/jade_mut_open.log
  exit 1
fi
c_ok "mutation window open"

# --- 4. upsert catalog row ---------------------------------------------------
c_do "upserting catalog row for $APP_ID..."
RESP="$(curl -s -w "\n%{http_code}" -X POST "$APP_MGR_BASE/api/v1/app-manager/apps" \
  -H 'Content-Type: application/json' \
  -d "{
    \"id\": \"$APP_ID\",
    \"title\": \"$APP_TITLE\",
    \"description\": \"$APP_DESC\",
    \"icon\": \"$APP_ICON\",
    \"type\": \"remote\",
    \"route_path\": \"/standalone/$APP_ID/\",
    \"health_endpoint\": \"/standalone/$APP_ID/\",
    \"on_shelf\": true
  }" 2>/dev/null || true)"
BODY="$(echo "$RESP" | sed -e '$d')"
CODE="$(echo "$RESP" | tail -n1)"
if [[ "$CODE" =~ ^2 ]]; then
  c_ok "catalog upsert ok (HTTP $CODE)"
elif [[ "$CODE" == "409" ]] || echo "$BODY" | grep -qiE 'already[ _]exist|duplicate|exists'; then
  c_warn "row exists, falling back to PUT update..."
  CODE="$(http_code -X PUT "$APP_MGR_BASE/api/v1/app-manager/apps/$APP_ID" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"$APP_TITLE\",\"description\":\"$APP_DESC\",\"route_path\":\"/standalone/$APP_ID/\",\"health_endpoint\":\"/standalone/$APP_ID/\",\"on_shelf\":true}")"
  echo "  PUT -> $CODE"
else
  c_fail "catalog POST failed (HTTP $CODE): $BODY"
  exit 1
fi

# --- 5. re-lock mutations ----------------------------------------------------
c_do "re-locking mutations (read-only)..."
BUILD_BACKEND=0 BUILD_STANDALONE_APPS=0 SYNC_STANDALONE_CATALOG=0 \
  "$DEPLOY_LOCAL" >/tmp/jade_mut_lock.log 2>&1
sleep 1
if [[ "$(http_code "$APP_MGR_BASE/health")" != "200" ]]; then
  c_warn "app-manager slow to return after re-lock; tail:"
  tail -n 20 /tmp/jade_mut_lock.log
fi
# Verify write APIs are locked again
LOCK_CODE="$(http_code -X PUT "$APP_MGR_BASE/api/v1/app-manager/apps/$APP_ID" \
  -H 'Content-Type: application/json' -d '{"route_path":"/standalone/'"$APP_ID"'/"}')"
if [[ "$LOCK_CODE" == "403" ]]; then
  c_ok "mutations locked (PUT -> 403)"
else
  c_warn "expected PUT -> 403 after re-lock, got $LOCK_CODE (continuing)"
fi

# --- 6. verify routes --------------------------------------------------------
c_do "verifying routes..."
CODE_BE="$(http_code "$APP_MGR_BASE/standalone/$APP_ID/")"
CODE_80="$(http_code "http://127.0.0.1/standalone/$APP_ID/")"
CODE_SHELL="$(http_code "http://127.0.0.1/app/$APP_ID")"
echo "  :$APP_MGR_PORT/standalone/$APP_ID/  -> $CODE_BE"
echo "  :80/standalone/$APP_ID/            -> $CODE_80"
echo "  :80/app/$APP_ID                    -> $CODE_SHELL"

REG_HIT="$(curl -s -m 6 "$APP_MGR_BASE/api/v1/app-manager/apps" 2>/dev/null | grep -c "\"id\":\"$APP_ID\"" || true)"
echo "  catalog row present              -> ${REG_HIT:-0}"

if [[ "$CODE_BE" == "200" && "$REG_HIT" -ge 1 ]]; then
  c_ok "jade-main-image-app is LIVE on /standalone/$APP_ID/"
else
  c_fail "deploy incomplete — standalone route on :$APP_MGR_PORT returned $CODE_BE"
  exit 1
fi

if [[ "$CODE_80" != "200" ]]; then
  c_warn "port-80 standalone route returned $CODE_80 (may be a gateway redirect; check gateway config if needed)"
fi

# --- 7. BFF note -------------------------------------------------------------
if [[ -f "$APP_DIR/bff/.env" ]]; then
  c_do "starting BFF on :5051 (GPT Image path)..."
  pushd "$APP_DIR/bff" >/dev/null
  if pgrep -f "bff/server.ts\|bff-server" >/dev/null 2>&1; then
    c_ok "BFF already running"
  else
    (npm start >/tmp/jade_bff.log 2>&1 &)
    sleep 2
    if [[ "$(http_code "http://127.0.0.1:5051/health")" == "200" ]]; then
      c_ok "BFF healthy on :5051"
    else
      c_warn "BFF did not become healthy; check /tmp/jade_bff.log"
    fi
  fi
  popd >/dev/null
else
  c_warn "bff/.env not found — GPT Image path disabled. Gemini path (via API Manager) still works."
  echo "  to enable GPT Image: cp $APP_DIR/bff/.env.example $APP_DIR/bff/.env  # then set GPT_API_KEY and re-run"
fi

echo
c_ok "deploy finished. Open: http://127.0.0.1/standalone/$APP_ID/  (or /app/$APP_ID)"
