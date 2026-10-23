#!/usr/bin/env bash
# Relaunch the video-clone-seedance-v2 local Node BFF + asset server (+ optional
# cloudflared asset tunnel) + rebuild app-manager.
#
# The BFF owns the CPRT multimodal-video orchestration (task submit + poll),
# the Doubao speech / voice-clone pipeline, and ffprobe-based reference video
# inspection for this standalone app. The local asset server (port 9894)
# serves uploaded assets; the cloudflared quick tunnel publishes it publicly
# so CPRT can fetch them (only needed for the "generate" step, not preview).
#
# Usage:
#   bash relaunch_video_clone_seedance_v2.sh
# Optional env overrides:
#   VIDEO_CLONE_SEEDANCE_V2_ADDR (default 127.0.0.1:9895)
#   VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT (default 9894)
#   START_ASSET_TUNNEL (default: auto -> 1 when cloudflared is available)
#   APP_MANAGER_PORT_OVERRIDE (default 3002)
#   BUILD_APP_MANAGER_BACKEND (default 1)
# Runtime env:
#   The BFF loads .run/video-clone-seedance-v2.env / .env.local / .env
#   automatically. Provider keys come from CPRT_KEY / BAILIAN_KEY /
#   LLM_TRANSLATE_* in .env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
MODULE_SCRIPTS_DIR="${REPO_ROOT}/moduls/app-manager/scripts"
STOP_SCRIPT="${MODULE_SCRIPTS_DIR}/stop_local.sh"
DEPLOY_SCRIPT="${MODULE_SCRIPTS_DIR}/deploy_local.sh"
APP_ROOT="${SCRIPT_DIR}"
BACKEND_RUN_DIR="${APP_ROOT}/.run"
BACKEND_PID_FILE="${BACKEND_RUN_DIR}/video-clone-seedance-v2.pid"
BACKEND_LOG_FILE="${APP_ROOT}/logs/video-clone-seedance-v2.log"
TUNNEL_PID_FILE="${BACKEND_RUN_DIR}/video-clone-seedance-v2-tunnel.pid"
TUNNEL_LOG_FILE="${APP_ROOT}/logs/video-clone-seedance-v2-tunnel.log"
ASSET_BASE_URL_FILE="${BACKEND_RUN_DIR}/public-asset-base-url"
APP_ID="${APP_ID:-video-clone-seedance-v2}"
APP_MANAGER_PORT_OVERRIDE="${APP_MANAGER_PORT_OVERRIDE:-3002}"
VIDEO_CLONE_SEEDANCE_V2_ADDR="${VIDEO_CLONE_SEEDANCE_V2_ADDR:-127.0.0.1:9895}"
VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT="${VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT:-9894}"
VIDEO_CLONE_SEEDANCE_V2_BASE_URL="${VIDEO_CLONE_SEEDANCE_V2_BASE_URL:-http://${VIDEO_CLONE_SEEDANCE_V2_ADDR}}"
BUILD_APP_MANAGER_BACKEND="${BUILD_APP_MANAGER_BACKEND:-1}"

if command -v cloudflared >/dev/null 2>&1; then
  START_ASSET_TUNNEL="${START_ASSET_TUNNEL:-1}"
else
  START_ASSET_TUNNEL="${START_ASSET_TUNNEL:-0}"
fi

# Avoid inherited shell env from other modules (e.g. api-manager) polluting app-manager launch.
unset DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSLMODE DATABASE_URL SERVER_PORT

if [[ ! -f "${DEPLOY_SCRIPT}" ]]; then
  echo "[relaunch_video_clone_seedance_v2] missing deploy script: ${DEPLOY_SCRIPT}"
  exit 1
fi

ensure_node_deps() {
  if [[ ! -x "${APP_ROOT}/node_modules/.bin/tsx" ]]; then
    echo "[relaunch_video_clone_seedance_v2] installing node deps"
    (
      cd "${APP_ROOT}"
      if command -v pnpm >/dev/null 2>&1; then
        pnpm install
      else
        npm install
      fi
    )
  fi
}

stop_processes_by_pattern() {
  local pattern="$1"
  local label="$2"
  local pids=()
  if command -v pgrep >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] && pids+=("${pid}")
    done < <(pgrep -f "${pattern}" || true)
  elif command -v ps >/dev/null 2>&1; then
    while IFS= read -r pid; do
      [[ -n "${pid}" ]] && pids+=("${pid}")
    done < <(ps -eo pid=,args= | awk -v pat="${pattern}" 'index($0, pat) > 0 {print $1}' | tr -d ' ' || true)
  else
    return 0
  fi
  for pid in "${pids[@]}"; do
    if ! kill -0 "${pid}" 2>/dev/null; then continue; fi
    echo "[relaunch_video_clone_seedance_v2] stopping ${label} pid=${pid}"
    kill "${pid}" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "${pid}" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
  done
}

stop_pid_file() {
  local pid_file="$1"
  local label="$2"
  local pid=""
  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}" 2>/dev/null || true)"
  fi
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "[relaunch_video_clone_seedance_v2] stopping ${label} pid=${pid}"
    kill "${pid}" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "${pid}" 2>/dev/null || { rm -f "${pid_file}"; return 0; }
      sleep 0.2
    done
    kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${pid_file}"
}

stop_backend() {
  stop_pid_file "${BACKEND_PID_FILE}" "video-clone-seedance-v2 backend"
  stop_processes_by_pattern "${APP_ROOT}/node_modules/.bin/tsx server/server.ts" "video-clone-seedance-v2 backend"
}

stop_tunnel() {
  stop_pid_file "${TUNNEL_PID_FILE}" "video-clone-seedance-v2 asset tunnel"
  stop_processes_by_pattern "${APP_ROOT}/node_modules/.bin/tsx server/tunnel.ts" "video-clone-seedance-v2 asset tunnel"
  # tunnel.ts removes the base-url file on clean exit; also clear stale leftovers.
  rm -f "${ASSET_BASE_URL_FILE}"
}

start_backend() {
  mkdir -p "${BACKEND_RUN_DIR}" "${APP_ROOT}/logs"
  ensure_node_deps
  stop_backend

  echo "[relaunch_video_clone_seedance_v2] starting BFF on ${VIDEO_CLONE_SEEDANCE_V2_ADDR} (asset server on 127.0.0.1:${VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT})"
  (
    cd "${APP_ROOT}"
    export PORT="${VIDEO_CLONE_SEEDANCE_V2_ADDR##*:}"
    export LOCAL_ASSET_PORT="${VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT}"
    setsid nohup "${APP_ROOT}/node_modules/.bin/tsx" server/server.ts \
      > "${BACKEND_LOG_FILE}" 2>&1 < /dev/null &
    local launched_pid=$!
    sleep 0.5
    local actual_pid=""
    if command -v pgrep >/dev/null 2>&1; then
      actual_pid="$(pgrep -f "${APP_ROOT}/node_modules/.bin/tsx server/server.ts" | head -n1 || true)"
    fi
    if [[ -z "${actual_pid}" ]]; then
      actual_pid="$(pgrep -f "${APP_ROOT}/server/server.ts" | head -n1 || true)"
    fi
    echo "${actual_pid:-$launched_pid}" > "${BACKEND_PID_FILE}"
  )

  if command -v curl >/dev/null 2>&1; then
    for _ in {1..40}; do
      if curl -fsS "${VIDEO_CLONE_SEEDANCE_V2_BASE_URL}/api/health" >/dev/null 2>&1; then
        echo "[relaunch_video_clone_seedance_v2] BFF is ready"
        return 0
      fi
      sleep 0.25
    done
  fi
  echo "[relaunch_video_clone_seedance_v2] BFF started, but readiness check did not pass yet (see ${BACKEND_LOG_FILE})"
}

start_tunnel() {
  if [[ "${START_ASSET_TUNNEL}" != "1" ]]; then
    echo "[relaunch_video_clone_seedance_v2] cloudflared not found -> skipping asset tunnel."
    echo "[relaunch_video_clone_seedance_v2] note: preview/download still work; 'generate' with uploaded assets needs the tunnel (install cloudflared or set PUBLIC_ASSET_BASE_URL)."
    return 0
  fi
  stop_tunnel
  echo "[relaunch_video_clone_seedance_v2] starting cloudflared asset tunnel for 127.0.0.1:${VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT}"
  (
    cd "${APP_ROOT}"
    export LOCAL_ASSET_PORT="${VIDEO_CLONE_SEEDANCE_V2_ASSET_PORT}"
    setsid nohup "${APP_ROOT}/node_modules/.bin/tsx" server/tunnel.ts \
      > "${TUNNEL_LOG_FILE}" 2>&1 < /dev/null &
    local launched_pid=$!
    sleep 0.5
    local actual_pid=""
    if command -v pgrep >/dev/null 2>&1; then
      actual_pid="$(pgrep -f "${APP_ROOT}/node_modules/.bin/tsx server/tunnel.ts" | head -n1 || true)"
    fi
    echo "${actual_pid:-$launched_pid}" > "${TUNNEL_PID_FILE}"
  )

  if command -v curl >/dev/null 2>&1; then
    for _ in {1..60}; do
      if [[ -s "${ASSET_BASE_URL_FILE}" ]]; then
        echo "[relaunch_video_clone_seedance_v2] asset tunnel ready: $(cat "${ASSET_BASE_URL_FILE}")"
        return 0
      fi
      sleep 0.5
    done
  fi
  echo "[relaunch_video_clone_seedance_v2] tunnel started, but public base url not observed yet (see ${TUNNEL_LOG_FILE})"
}

echo "[relaunch_video_clone_seedance_v2] rebuilding and relaunching ${APP_ID}"
echo "[relaunch_video_clone_seedance_v2] target app-manager port: ${APP_MANAGER_PORT_OVERRIDE}"

start_backend
start_tunnel

if [[ -f "${STOP_SCRIPT}" ]]; then
  bash "${STOP_SCRIPT}" || true
fi

STANDALONE_APP_IDS="${APP_ID}" \
SERVER_PORT="${APP_MANAGER_PORT_OVERRIDE}" \
APP_MANAGER_PORT="${APP_MANAGER_PORT_OVERRIDE}" \
APP_MANAGER_VIDEO_CLONE_SEEDANCE_V2_BASE_URL="${VIDEO_CLONE_SEEDANCE_V2_BASE_URL}" \
BUILD_STANDALONE_APPS=1 \
SKIP_UP_APPS=0 \
BUILD_BACKEND="${BUILD_APP_MANAGER_BACKEND}" \
INSTALL_DEPS="${INSTALL_DEPS:-0}" \
BACKGROUND="${BACKGROUND:-1}" \
bash "${DEPLOY_SCRIPT}"
