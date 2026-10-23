#!/usr/bin/env bash
# Relaunch the video-clone-seedance local Node BFF + rebuild app-manager.
# The BFF owns the CPRT multimodal-video orchestration (task submit + poll)
# and ffprobe-based reference video inspection for this standalone app.
#
# Usage:
#   bash relaunch_video_clone_seedance.sh
# Optional env overrides:
#   VIDEO_CLONE_SEEDANCE_ADDR (default 127.0.0.1:9896)
#   APP_MANAGER_PORT_OVERRIDE (default 3002)
#   BUILD_APP_MANAGER_BACKEND (default 1)
# Runtime env:
#   The BFF loads .env / .env.local automatically. The CPRT provider key is
#   provided as CPRT_KEY.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
MODULE_SCRIPTS_DIR="${REPO_ROOT}/moduls/app-manager/scripts"
STOP_SCRIPT="${MODULE_SCRIPTS_DIR}/stop_local.sh"
DEPLOY_SCRIPT="${MODULE_SCRIPTS_DIR}/deploy_local.sh"
APP_ROOT="${SCRIPT_DIR}"
BACKEND_RUN_DIR="${APP_ROOT}/.run"
BACKEND_PID_FILE="${BACKEND_RUN_DIR}/video-clone-seedance.pid"
BACKEND_LOG_FILE="${APP_ROOT}/logs/video-clone-seedance.log"
APP_ID="${APP_ID:-video-clone-seedance}"
APP_MANAGER_PORT_OVERRIDE="${APP_MANAGER_PORT_OVERRIDE:-3002}"
VIDEO_CLONE_SEEDANCE_ADDR="${VIDEO_CLONE_SEEDANCE_ADDR:-127.0.0.1:9896}"
VIDEO_CLONE_SEEDANCE_BASE_URL="${VIDEO_CLONE_SEEDANCE_BASE_URL:-http://${VIDEO_CLONE_SEEDANCE_ADDR}}"
BUILD_APP_MANAGER_BACKEND="${BUILD_APP_MANAGER_BACKEND:-1}"

# Avoid inherited shell env from other modules (e.g. api-manager) polluting app-manager launch.
unset DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME DB_SSLMODE DATABASE_URL SERVER_PORT

if [[ ! -f "${DEPLOY_SCRIPT}" ]]; then
  echo "[relaunch_video_clone_seedance] missing deploy script: ${DEPLOY_SCRIPT}"
  exit 1
fi

ensure_node_deps() {
  if [[ ! -x "${APP_ROOT}/node_modules/.bin/tsx" ]]; then
    echo "[relaunch_video_clone_seedance] installing node deps"
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
    echo "[relaunch_video_clone_seedance] stopping ${label} pid=${pid}"
    kill "${pid}" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "${pid}" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null || true
  done
}

stop_backend() {
  local pid=""
  local backend_pattern="${APP_ROOT}/node_modules/.bin/tsx server/server.ts"
  if [[ -f "${BACKEND_PID_FILE}" ]]; then
    pid="$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)"
  fi
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "[relaunch_video_clone_seedance] stopping backend pid=${pid}"
    kill "${pid}" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "${pid}" 2>/dev/null || { rm -f "${BACKEND_PID_FILE}"; return 0; }
      sleep 0.2
    done
    kill -9 "${pid}" 2>/dev/null || true
  fi
  rm -f "${BACKEND_PID_FILE}"
  stop_processes_by_pattern "${backend_pattern}" "video-clone-seedance backend"
}

start_backend() {
  mkdir -p "${BACKEND_RUN_DIR}" "${APP_ROOT}/logs"
  ensure_node_deps
  stop_backend

  echo "[relaunch_video_clone_seedance] starting BFF on ${VIDEO_CLONE_SEEDANCE_ADDR}"
  (
    cd "${APP_ROOT}"
    export PORT="${VIDEO_CLONE_SEEDANCE_ADDR##*:}"
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
      if curl -fsS "${VIDEO_CLONE_SEEDANCE_BASE_URL}/api/health" >/dev/null 2>&1; then
        echo "[relaunch_video_clone_seedance] BFF is ready"
        return 0
      fi
      sleep 0.25
    done
  fi
  echo "[relaunch_video_clone_seedance] BFF started, but readiness check did not pass yet (see ${BACKEND_LOG_FILE})"
}

echo "[relaunch_video_clone_seedance] rebuilding and relaunching ${APP_ID}"
echo "[relaunch_video_clone_seedance] target app-manager port: ${APP_MANAGER_PORT_OVERRIDE}"

start_backend

if [[ -f "${STOP_SCRIPT}" ]]; then
  bash "${STOP_SCRIPT}" || true
fi

STANDALONE_APP_IDS="${APP_ID}" \
SERVER_PORT="${APP_MANAGER_PORT_OVERRIDE}" \
APP_MANAGER_PORT="${APP_MANAGER_PORT_OVERRIDE}" \
APP_MANAGER_VIDEO_CLONE_SEEDANCE_BASE_URL="${VIDEO_CLONE_SEEDANCE_BASE_URL}" \
BUILD_STANDALONE_APPS=1 \
SKIP_UP_APPS=0 \
BUILD_BACKEND="${BUILD_APP_MANAGER_BACKEND}" \
INSTALL_DEPS="${INSTALL_DEPS:-0}" \
BACKGROUND="${BACKGROUND:-1}" \
bash "${DEPLOY_SCRIPT}"
